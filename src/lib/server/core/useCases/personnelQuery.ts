/**
 * Personnel query use cases — fetch personnel with filtering, sorting, and pagination.
 *
 * `queryPersonnel(ctx, options?)` supports `archived` flag ('all' | true | false),
 * custom `orderBy`, and cursor-based `range` for pagination.
 *
 * Workspace-owned personnel bootstraps such as pinned groups and rating scheme entries
 * are loaded through `personnelWorkspaceQuery.ts`. For the shared layout query
 * (all personnel + groups), see `sharedDataQuery.ts`.
 */
import type { QueryPorts, FindOptions } from '$lib/server/core/ports';
import type { Personnel } from '$lib/types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { requireFeaturePolicy } from './featurePolicy';

export interface PersonnelQueryOptions {
	archived?: boolean | 'all';
	orderBy?: FindOptions['orderBy'];
	range?: FindOptions['range'];
	filters?: FindOptions['filters'];
	inFilters?: FindOptions['inFilters'];
	rangeFilters?: FindOptions['rangeFilters'];
	select?: string;
}

function buildFindOptions(options?: PersonnelQueryOptions): FindOptions {
	const archived = options?.archived ?? false;
	const isNull: Record<string, boolean> = {};

	if (archived === false) {
		isNull.archived_at = true;
	} else if (archived === true) {
		isNull.archived_at = false;
	}
	// archived === 'all' — no filter

	return {
		select: options?.select ?? PersonnelEntity.select,
		orderBy: options?.orderBy ?? [{ column: 'last_name', ascending: true }],
		isNull: Object.keys(isNull).length > 0 ? isNull : undefined,
		filters: options?.filters,
		inFilters: options?.inFilters,
		rangeFilters: options?.rangeFilters,
		range: options?.range
	};
}

export async function queryPersonnel(ctx: QueryPorts, options?: PersonnelQueryOptions): Promise<Personnel[]> {
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.viewRoster, { kind: 'unscoped' }, 'personnel');
	const rows = await ctx.store.findMany<Record<string, unknown>>(
		'personnel',
		ctx.auth.orgId,
		undefined,
		buildFindOptions(options)
	);
	return PersonnelEntity.fromDbArray(rows);
}

export async function countPersonnel(ctx: QueryPorts, options?: PersonnelQueryOptions): Promise<number> {
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.viewRoster, { kind: 'unscoped' }, 'personnel');
	const { count } = await ctx.store.findManyWithCount<Record<string, unknown>>(
		'personnel',
		ctx.auth.orgId,
		undefined,
		buildFindOptions(options)
	);
	return count ?? 0;
}

export async function queryPersonnelRaw(
	ctx: QueryPorts,
	options?: PersonnelQueryOptions
): Promise<Record<string, unknown>[]> {
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.viewRoster, { kind: 'unscoped' }, 'personnel');
	return ctx.store.findMany<Record<string, unknown>>('personnel', ctx.auth.orgId, undefined, buildFindOptions(options));
}
