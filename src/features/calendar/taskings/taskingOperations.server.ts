import { z } from 'zod';
import { fail } from '$lib/errors';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { AuditPort } from '$lib/audit/contracts';
import type { GroupPersistence } from '$features/personnel/contracts';
import { evaluateAuthoritativePolicyDecision } from '$lib/access/index.server';
import { issueMessage, uuidSchema } from '$lib/utils/inputSchemas';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from '../calendarPolicy.server';
import type { CalendarEventPersistence } from '../events/eventPersistence.server';
import type { MemberLabels } from '../events/eventModel';
import {
	responsibilityKey,
	taskingDraftSchema,
	taskingTransitionSchema,
	type GroupLabels,
	type Tasking,
	type TaskingAction,
	type TaskingActivityLog,
	type TaskingChoices,
	type TaskingDetail,
	type TaskingList,
	type TaskingListScope
} from './taskingModel';
import { TASKING_GONE, type CalendarTaskingPersistence } from './taskingPersistence.server';

export interface CalendarTaskingPorts {
	auth: OrganizationAccessGrant;
	audit: AuditPort;
	calendarTaskings: CalendarTaskingPersistence;
	calendarEvents: Pick<CalendarEventPersistence, 'listEvents'>;
	/** The Groups the viewer's scope covers. */
	groups: Pick<GroupPersistence, 'listCatalog'>;
	memberLabels(): Promise<MemberLabels>;
}

const ORGANIZATION = { kind: 'organization' } as const;
const createInput = z.object({ id: uuidSchema, draft: taskingDraftSchema }).strict();

const AUDIT_VERBS: Record<TaskingAction, string> = {
	start: 'started',
	block: 'blocked',
	unblock: 'unblocked',
	complete: 'completed',
	reopen: 'reopened',
	cancel: 'cancelled'
};

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
	const parsed = schema.safeParse(input);
	if (!parsed.success) fail(400, issueMessage(parsed.error));
	return parsed.data;
}

function taskingId(id: string): string {
	if (!uuidSchema.safeParse(id).success) fail(404, TASKING_GONE);
	return id;
}

const audited = (verb: string, tasking: Tasking) => ({
	action: `calendar_tasking.${verb}`,
	resourceType: 'calendar_tasking',
	resourceId: tasking.id,
	details: { title: tasking.title }
});

async function groupLabels(ctx: CalendarTaskingPorts): Promise<GroupLabels> {
	return Object.fromEntries((await ctx.groups.listCatalog()).map((group) => [group.id, group.name]));
}

async function requireExisting(ctx: CalendarTaskingPorts, id: string): Promise<Tasking> {
	const tasking = await ctx.calendarTaskings.findTasking(taskingId(id));
	if (!tasking) fail(404, TASKING_GONE);
	return tasking;
}

export async function listTaskings(ctx: CalendarTaskingPorts, scope: TaskingListScope): Promise<TaskingList> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	const [taskings, groups] = await Promise.all([ctx.calendarTaskings.listTaskings(scope), groupLabels(ctx)]);
	return { scope, taskings, groups };
}

/** The Taskings under one Event that the viewer's scope covers. */
export async function listEventTaskings(
	ctx: CalendarTaskingPorts,
	eventId: string
): Promise<{ taskings: Tasking[]; groups: GroupLabels }> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	if (!uuidSchema.safeParse(eventId).success) return { taskings: [], groups: {} };
	const [taskings, groups] = await Promise.all([ctx.calendarTaskings.listEventTaskings(eventId), groupLabels(ctx)]);
	return { taskings, groups };
}

export async function loadTaskingDetail(ctx: CalendarTaskingPorts, id: string): Promise<TaskingDetail> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	const [tasking, groups, members] = await Promise.all([
		ctx.calendarTaskings.findTasking(taskingId(id)),
		groupLabels(ctx),
		ctx.memberLabels()
	]);
	if (!tasking) fail(404, TASKING_GONE);
	return { tasking, groups, members };
}

export async function listTaskingActivity(ctx: CalendarTaskingPorts, id: string): Promise<TaskingActivityLog> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	const entries = await ctx.calendarTaskings.listActivity(taskingId(id));
	const eventIds = entries.flatMap((entry) =>
		entry.kind === 'linked' || entry.kind === 'unlinked' ? [entry.eventId] : []
	);
	return { entries, eventTitles: await ctx.calendarTaskings.findEventTitles(eventIds) };
}

/** Groups the viewer could pick and the Events not yet over and not cancelled; nothing for a reader who cannot create. */
export async function loadTaskingChoices(ctx: CalendarTaskingPorts, today: string): Promise<TaskingChoices | null> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	const decision = await evaluateAuthoritativePolicyDecision(ctx, CALENDAR_POLICY_ACTIONS.manageTaskings, {
		kind: 'unscoped'
	});
	if (!decision.allowed) return null;
	const [groups, events] = await Promise.all([
		ctx.groups.listCatalog(),
		ctx.calendarEvents.listEvents('upcoming', today)
	]);
	return {
		groups: groups.map(({ id, name }) => ({ id, name })),
		events: events
			.filter((event) => event.cancellation === null)
			.map(({ id, title, startsOn, endsOn }) => ({ id, title, startsOn, endsOn }))
	};
}

export async function createTasking(ctx: CalendarTaskingPorts, input: unknown): Promise<Tasking> {
	const { id, draft } = parse(createInput, input);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageTaskings, draft.responsibility);
	const { tasking, created } = await ctx.calendarTaskings.createTasking(id, draft);
	if (created) await ctx.audit.log(audited('created', tasking));
	return tasking;
}

/** A Group-scoped operator edits every field of their Group's Tasking but its responsibility. */
export async function updateTasking(ctx: CalendarTaskingPorts, id: string, input: unknown): Promise<Tasking> {
	const draft = parse(taskingDraftSchema, input);
	const existing = await requireExisting(ctx, id);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageTaskings, existing.responsibility);
	if (responsibilityKey(existing.responsibility) !== responsibilityKey(draft.responsibility))
		await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageTaskings, ORGANIZATION);
	const tasking = await ctx.calendarTaskings.updateTasking(existing.id, draft);
	if (!tasking) fail(404, TASKING_GONE);
	await ctx.audit.log(audited('updated', tasking));
	return tasking;
}

export async function transitionTasking(ctx: CalendarTaskingPorts, id: string, input: unknown): Promise<Tasking> {
	const transition = parse(taskingTransitionSchema, input);
	const existing = await requireExisting(ctx, id);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageTaskings, existing.responsibility);
	const { tasking, moved } = await ctx.calendarTaskings.transitionTasking(existing.id, transition);
	if (moved) await ctx.audit.log(audited(AUDIT_VERBS[transition.action], tasking));
	return tasking;
}
