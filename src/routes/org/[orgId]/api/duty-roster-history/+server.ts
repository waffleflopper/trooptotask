import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { isManualHistoryImport } from '$features/duty-roster/run';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import { RosterHistoryEntity } from '$lib/server/entities/rosterHistory';

export const _getConfig: RouteConfig<void, unknown> = {
	policyAction: POLICY_ACTION_CATALOG.calendar.viewDutyRosters,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx) => {
		const rows = await ctx.store.findMany<Record<string, unknown>>('duty_roster_history', ctx.auth.orgId, undefined, {
			orderBy: [{ column: 'created_at', ascending: false }]
		});
		return RosterHistoryEntity.fromDbArray(rows);
	}
};

function validateManualHistoryImport(input: Record<string, unknown>) {
	if (!isManualHistoryImport(input.config as Record<string, unknown> | undefined)) {
		return;
	}
	const roster = input.roster;
	const sourceNote = (input.config as Record<string, unknown>).sourceNote;
	if (!Array.isArray(roster) || roster.length === 0 || !roster.every((row) => row && typeof row === 'object')) {
		fail(400, 'Manual history imports require at least one charged duty row.');
	}
	if (!roster.every((row) => typeof (row as Record<string, unknown>).assigneeId === 'string')) {
		fail(400, 'Manual history imports require a charged Soldier for each duty row.');
	}
	if (typeof sourceNote !== 'string' || sourceNote.trim().length === 0) {
		fail(400, 'Manual history imports require a source note.');
	}
}

export const _postConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageDutyRosters,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		validateManualHistoryImport(input);
		const insertData = {
			...RosterHistoryEntity.toDbInsert(input, ctx.auth.orgId),
			created_by_user_id: ctx.auth.userId ?? null
		};

		const row = await ctx.store.insert<Record<string, unknown>>('duty_roster_history', ctx.auth.orgId, insertData);
		const result = RosterHistoryEntity.fromDb(row);
		ctx.audit.log({
			action: isManualHistoryImport(input.config as Record<string, unknown> | undefined)
				? 'duty_roster.manual_history_imported'
				: 'duty_roster.created',
			resourceType: 'duty_roster',
			resourceId: result.id
		});
		return result;
	}
};

export const GET = handle(_getConfig);
export const POST = handle(_postConfig);
