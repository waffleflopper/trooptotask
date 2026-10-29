import type { z } from 'zod';
import { fail } from '$lib/errors';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { AuditPort } from '$lib/audit/contracts';
import { buildGroupTree, type GroupPersistence, type PersonnelCalendarRosterPort } from '$features/personnel/contracts';
import { issueMessage, uuidSchema } from '$lib/utils/inputSchemas';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from '../../calendarPolicy.server';
import type { Tasking } from '../taskingModel';
import { TASKING_GONE, type CalendarTaskingPersistence } from '../taskingPersistence.server';
import {
	isCandidateFor,
	staffingPersonState,
	staffingSaveSchema,
	type StaffingAdvisories,
	type StaffingPersonState,
	type StaffingPicker,
	type StaffingSaveResult,
	type TaskingStaffing
} from './staffingModel';
import type { CalendarStaffingPersistence } from './staffingPersistence.server';

export interface CalendarStaffingPorts {
	auth: OrganizationAccessGrant;
	audit: AuditPort;
	calendarTaskings: Pick<CalendarTaskingPersistence, 'findTasking'>;
	calendarStaffing: CalendarStaffingPersistence;
	groups: Pick<GroupPersistence, 'listCatalog'>;
	personnelCalendarRoster: Pick<PersonnelCalendarRosterPort, 'listActive'>;
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
	const parsed = schema.safeParse(input);
	if (!parsed.success) fail(400, issueMessage(parsed.error));
	return parsed.data;
}

async function requireTasking(ctx: CalendarStaffingPorts, id: string): Promise<Tasking> {
	const tasking = uuidSchema.safeParse(id).success ? await ctx.calendarTaskings.findTasking(id) : null;
	if (!tasking) fail(404, TASKING_GONE);
	return tasking;
}

async function requireStaffing(ctx: CalendarStaffingPorts, id: string): Promise<TaskingStaffing> {
	const staffing = await ctx.calendarStaffing.findStaffing(id);
	if (!staffing) fail(404, TASKING_GONE);
	return staffing;
}

export async function loadTaskingStaffing(ctx: CalendarStaffingPorts, id: string): Promise<TaskingStaffing> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	if (!uuidSchema.safeParse(id).success) fail(404, TASKING_GONE);
	return requireStaffing(ctx, id);
}

/** Everything the Assign people picker needs, in one request; a failed advisory read never hides the roster. */
export async function loadStaffingPicker(ctx: CalendarStaffingPorts, id: string): Promise<StaffingPicker> {
	const tasking = await requireTasking(ctx, id);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageTaskings, tasking.responsibility);
	const [staffing, people, groups, advisories] = await Promise.all([
		requireStaffing(ctx, tasking.id),
		ctx.personnelCalendarRoster.listActive(ctx.auth),
		ctx.groups.listCatalog(),
		tasking.execution
			? ctx.calendarStaffing.listAdvisories(tasking.id).then(
					(byPerson): StaffingAdvisories => ({ kind: 'loaded', byPerson }),
					(cause): StaffingAdvisories => {
						console.error('[calendar-staffing] Failed to load advisories:', cause);
						return { kind: 'failed' };
					}
				)
			: ({ kind: 'no_execution' } as const)
	]);
	const tree = buildGroupTree(groups);
	const candidates = people.filter((person) => isCandidateFor(tasking.responsibility, person, tree));
	return {
		tasking: { requirement: tasking.requirement, execution: tasking.execution },
		staffing,
		candidates: candidates.map(({ id, rank, firstName, lastName, groupId, mos, clinicRole }) => ({
			personnelId: id,
			rank,
			firstName,
			lastName,
			groupId,
			mos,
			clinicRole
		})),
		advisories,
		states: Object.fromEntries(
			[...new Set([...candidates.map((p) => p.id), ...staffing.picks.map((p) => p.personnelId)])].map((id) => [
				id,
				staffingPersonState(id, advisories)
			])
		)
	};
}

/** Replaces the whole selection at once; a stale revision changes nothing and returns what is stored now. */
export async function saveTaskingPeople(
	ctx: CalendarStaffingPorts,
	id: string,
	input: unknown
): Promise<StaffingSaveResult> {
	const save = parse(staffingSaveSchema, input);
	const tasking = await requireTasking(ctx, id);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageTaskings, tasking.responsibility);
	const { outcome, revision } = await ctx.calendarStaffing.saveStaffing(tasking.id, save);
	const staffing = await requireStaffing(ctx, tasking.id);
	if (outcome === 'saved')
		await ctx.audit.log({
			action: 'calendar_tasking.staffed',
			resourceType: 'calendar_tasking',
			resourceId: tasking.id,
			details: { title: tasking.title, picked: staffing.picked, needsReview: staffing.needsReview }
		});
	return { outcome, revision, staffing };
}

export async function loadTaskingPickStates(
	ctx: CalendarStaffingPorts,
	id: string
): Promise<Record<string, StaffingPersonState>> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.viewEvents);
	const [tasking, staffing] = await Promise.all([requireTasking(ctx, id), requireStaffing(ctx, id)]);
	const advisories: StaffingAdvisories = tasking.execution
		? await ctx.calendarStaffing.listAdvisories(id).then(
				(byPerson): StaffingAdvisories => ({ kind: 'loaded', byPerson }),
				(): StaffingAdvisories => ({ kind: 'failed' })
			)
		: { kind: 'no_execution' };
	return Object.fromEntries(
		staffing.picks.map((pick) => [
			pick.personnelId,
			advisories.kind === 'loaded' && (pick.reviewSince !== null || pick.archived)
				? { kind: 'clear' }
				: staffingPersonState(pick.personnelId, advisories)
		])
	);
}
