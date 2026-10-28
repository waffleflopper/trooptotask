import { error } from '@sveltejs/kit';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPolicy,
	type CalendarCatalogPorts,
	type CalendarCatalogDeletionPorts
} from './calendarPolicy.server';
import {
	assignmentTypeCreateInput,
	assignmentTypeUpdateInput,
	calendarLanesInput
} from './calendarPersistenceMapping.server';
import { issueMessage } from '$lib/utils/inputSchemas';
import { endRoster, type RosterSettingsPorts } from './rosterSettingsOperations.server';

const action = CALENDAR_POLICY_ACTIONS.configureAssignmentTypes;
const resource = { kind: 'organization' } as const;

export async function createAssignmentType(ctx: CalendarCatalogPorts, input: Record<string, unknown>) {
	const parsed = assignmentTypeCreateInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	await requireCalendarPolicy(ctx, action, resource);
	const row = await ctx.calendarCatalogs.createAssignmentType(parsed.data);
	await ctx.audit.log({
		action: 'assignment_type.created',
		resourceType: 'assignment_type',
		resourceId: row.id
	});
	return row;
}

/** A switch to Group closes the type's open DA 6 form on the editor's `today` first. */
export async function updateAssignmentType(ctx: RosterSettingsPorts, input: Record<string, unknown>) {
	const parsed = assignmentTypeUpdateInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const { id, today, ...patch } = parsed.data;
	await requireCalendarPolicy(ctx, action, resource);
	if (patch.assignTo === 'group') await endRoster(ctx, id, today);
	const row = await ctx.calendarCatalogs.updateAssignmentType(id, patch);
	if (!row) throw error(404, 'That assignment type is no longer available.');
	ctx.audit.log({ action: 'assignment_type.updated', resourceType: 'assignment_type', resourceId: id });
	return row;
}

export async function setCalendarLanes(ctx: CalendarCatalogPorts, input: Record<string, unknown>) {
	const parsed = calendarLanesInput.safeParse(input);
	if (!parsed.success) throw error(400, 'Choose the assignment types to show on the calendar');
	const { laneTypeIds, expectedLaneTypeIds } = parsed.data;
	await requireCalendarPolicy(ctx, action, resource);
	await ctx.calendarCatalogs.setCalendarLanes(laneTypeIds, expectedLaneTypeIds);
	ctx.audit.log({
		action: 'assignment_type.calendar_lanes_set',
		resourceType: 'organization',
		resourceId: ctx.auth.orgId,
		details: { laneTypeIds }
	});
}

export async function deleteAssignmentType(ctx: CalendarCatalogDeletionPorts, id: string): Promise<void> {
	await requireCalendarPolicy(ctx, action, resource);
	if (!(await ctx.calendarCatalogs.deleteAssignmentType(id))) return;
	ctx.audit.log({ action: 'assignment_type.deleted', resourceType: 'assignment_type', resourceId: id });
	await ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
		type: 'config_type_deleted',
		title: 'Assignment Type Deleted',
		message: 'An assignment type was deleted.'
	});
}
