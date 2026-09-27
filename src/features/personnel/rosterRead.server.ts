import type { RosterStatus } from './rosterReadModel';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { Personnel } from '$lib/types';

interface RosterQueryContext {
	auth: { orgId: string };
	store: {
		findMany<T>(
			table: string,
			orgId: string,
			filters: undefined,
			options: {
				select: string;
				orderBy: Array<{ column: string; ascending: boolean }>;
				isNull?: Record<string, boolean>;
			}
		): Promise<T[]>;
	};
}

interface RosterReadOptions {
	status?: RosterStatus;
	order?: 'archived-newest';
}

const NAME_ORDER = [
	{ column: 'last_name', ascending: true },
	{ column: 'first_name', ascending: true }
];

// The caller supplies its request store. Its feature policy and SQL RLS determine
// which rows are visible; this helper does not select a privileged provider.
export async function loadRosterPersonnel(
	ctx: RosterQueryContext,
	options: RosterReadOptions = {}
): Promise<Personnel[]> {
	const status = options.status ?? 'active';
	const rows = await ctx.store.findMany<Record<string, unknown>>(PersonnelEntity.table, ctx.auth.orgId, undefined, {
		select: PersonnelEntity.select,
		orderBy: options.order === 'archived-newest' ? [{ column: 'archived_at', ascending: false }] : NAME_ORDER,
		isNull: status === 'all' ? undefined : { archived_at: status === 'active' }
	});

	return PersonnelEntity.fromDbArray(rows);
}

/** Count archived Personnel for an already admitted Organization settings request. */
export async function countArchivedPersonnel(ctx: {
	auth: { orgId: string };
	store: {
		findManyWithCount(
			table: string,
			orgId: string,
			filters: undefined,
			options: { select: string; isNull: Record<string, boolean>; limit: number }
		): Promise<{ count: number | null }>;
	};
}): Promise<number> {
	const result = await ctx.store.findManyWithCount(PersonnelEntity.table, ctx.auth.orgId, undefined, {
		select: 'id',
		isNull: { archived_at: false },
		limit: 0
	});
	return result.count ?? 0;
}
