import { findGroupNamesByIds, loadOrganizationRankCatalog } from '$features/personnel/index.server';
import type { SignInRosterPersonnelLookupPort } from '$features/personnel/contracts';
import type { SignInRosterPersistence } from '$features/sign-in-rosters/index.server';
import type { SignInRoster } from '$features/sign-in-rosters';
import { createTestContext } from '$lib/server/adapters/inMemory';

type RosterTestContext = ReturnType<typeof createTestContext>;

export function createRosterTestContext(...args: Parameters<typeof createTestContext>) {
	const personnelLookup: SignInRosterPersonnelLookupPort = {
		async findPersonnelForRosterSnapshot() {
			throw new Error('Bind the owned Personnel lookup for this roster fixture');
		}
	};
	return { ...createTestContext(...args), personnelLookup };
}

function createRosterTestPersistence(ctx: RosterTestContext): SignInRosterPersistence {
	type Row = {
		id: string;
		title: string;
		roster_date: string | null;
		blank_date: boolean;
		separate_by_group: boolean;
		sort_by: SignInRoster['sortBy'];
		personnel_snapshot: SignInRoster['personnelSnapshot'];
		filter_config: SignInRoster['filterConfig'];
		signed_file_path: string | null;
		created_by: string;
		created_at: string;
		scope_group_ids?: string[];
	};
	const map = (row: Row): SignInRoster => ({
		id: row.id,
		title: row.title,
		rosterDate: row.roster_date,
		blankDate: row.blank_date,
		separateByGroup: row.separate_by_group,
		sortBy: row.sort_by,
		personnelSnapshot: row.personnel_snapshot,
		filterConfig: row.filter_config,
		signedFilePath: row.signed_file_path,
		createdBy: row.created_by,
		createdAt: row.created_at
	});
	const visible = (row: Row) => {
		const scope = ctx.auth.scopeSet;
		return (
			scope.kind !== 'groups' ||
			(Array.isArray(row.scope_group_ids) &&
				row.scope_group_ids.length > 0 &&
				row.scope_group_ids.every((id) => scope.groupIds.includes(id)))
		);
	};
	return {
		async list(input) {
			if (ctx.auth.scopeSet.kind === 'groups' && ctx.auth.scopeSet.groupIds.length === 0) return { data: [], count: 0 };
			const rows = (
				await ctx.rawStore.findMany<Row>('sign_in_rosters', ctx.auth.orgId, undefined, {
					orderBy: [{ column: 'created_at', ascending: false }],
					...(input.title ? { ilikeFilters: { title: `%${input.title}%` } } : {}),
					rangeFilters: [
						...(input.from ? [{ column: 'created_at', op: 'gte' as const, value: input.from }] : []),
						...(input.to ? [{ column: 'created_at', op: 'lte' as const, value: input.to + 'T23:59:59.999Z' }] : [])
					]
				})
			).filter(visible);
			return { data: rows.slice(input.offset, input.offset + input.limit).map(map), count: rows.length };
		},
		async find(id) {
			if (ctx.auth.scopeSet.kind === 'groups' && ctx.auth.scopeSet.groupIds.length === 0) return null;
			const row = await ctx.rawStore.findOne<Row>('sign_in_rosters', ctx.auth.orgId, { id });
			return row && visible(row) ? map(row) : null;
		},
		async create(input) {
			return map(
				await ctx.store.insert<Row>('sign_in_rosters', ctx.auth.orgId, {
					title: input.title,
					roster_date: input.rosterDate,
					blank_date: input.blankDate,
					separate_by_group: input.separateByGroup,
					sort_by: input.sortBy,
					personnel_snapshot: input.personnelSnapshot,
					personnel_ids: input.personnelIds,
					scope_group_ids: input.scopeGroupIds,
					filter_config: input.filterConfig,
					signed_file_path: null,
					created_by: input.createdBy
				})
			);
		},
		async setSignedFilePath(id, path) {
			await ctx.store.update('sign_in_rosters', ctx.auth.orgId, id, { signed_file_path: path });
		},
		delete(id) {
			return ctx.store.delete('sign_in_rosters', ctx.auth.orgId, id);
		}
	};
}

export function selectRosterContext(ctx: RosterTestContext) {
	return {
		orgId: ctx.auth.orgId,
		persistence: createRosterTestPersistence(ctx),
		storage: ctx.storage,
		audit: ctx.audit
	};
}

export function selectRosterCreationContext(
	ctx: RosterTestContext & { personnelLookup: SignInRosterPersonnelLookupPort }
) {
	return {
		...selectRosterContext(ctx),
		userId: ctx.auth.userId,
		scopeSet: ctx.auth.scopeSet,
		personnelLookup: ctx.personnelLookup,
		findGroupNamesByIds: (groupIds: string[]) => findGroupNamesByIds({ groups: ctx.groups }, groupIds),
		loadRankCatalog: () =>
			loadOrganizationRankCatalog({ auth: ctx.auth, store: ctx.rawStore }, { authorization: 'training-records' })
	};
}

export function selectRosterUploadContext(ctx: RosterTestContext) {
	return { ...selectRosterContext(ctx), actor: ctx.auth, fileWrites: ctx.signInRosterFileWrites };
}
