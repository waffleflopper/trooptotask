import { listGroupCatalog, loadOrganizationRankCatalog } from '$features/personnel/index.server';
import type { SignInRosterPersonnelLookupPort } from '$features/personnel/contracts';
import type { SignInRosterPersistence, SignInRosterScanPort } from '$features/sign-in-rosters/index.server';
import type { FileCleanup } from '$features/organization/contracts';
import { SENSITIVE_FILE_BUCKET } from '$lib/storage/sensitiveFiles';
import { fail } from '$lib/errors';
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

type RosterRow = {
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

function visibleRoster(ctx: RosterTestContext, row: RosterRow) {
	const scope = ctx.auth.scopeSet;
	return (
		scope.kind !== 'groups' ||
		(Array.isArray(row.scope_group_ids) &&
			row.scope_group_ids.length > 0 &&
			row.scope_group_ids.every((id) => scope.groupIds.includes(id)))
	);
}

function createRosterTestPersistence(ctx: RosterTestContext): SignInRosterPersistence {
	const map = (row: RosterRow): SignInRoster => ({
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
	return {
		async list(input) {
			if (ctx.auth.scopeSet.kind === 'groups' && ctx.auth.scopeSet.groupIds.length === 0)
				return { data: [], count: 0, unsigned: 0 };
			const rows = (
				await ctx.rawStore.findMany<RosterRow>('sign_in_rosters', ctx.auth.orgId, undefined, {
					orderBy: [{ column: 'created_at', ascending: false }],
					...(input.title ? { ilikeFilters: { title: `%${input.title}%` } } : {}),
					rangeFilters: [
						...(input.createdFrom ? [{ column: 'created_at', op: 'gte' as const, value: input.createdFrom }] : []),
						...(input.createdBefore ? [{ column: 'created_at', op: 'lt' as const, value: input.createdBefore }] : [])
					]
				})
			).filter((row) => visibleRoster(ctx, row));
			return {
				data: rows.slice(input.offset, input.offset + input.limit).map(map),
				count: rows.length,
				unsigned: rows.filter((row) => !row.signed_file_path).length
			};
		},
		async find(id) {
			if (ctx.auth.scopeSet.kind === 'groups' && ctx.auth.scopeSet.groupIds.length === 0) return null;
			const row = await ctx.rawStore.findOne<RosterRow>('sign_in_rosters', ctx.auth.orgId, { id });
			return row && visibleRoster(ctx, row) ? map(row) : null;
		},
		async create(input) {
			return map(
				await ctx.store.insert<RosterRow>('sign_in_rosters', ctx.auth.orgId, {
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
		}
	};
}

function createRosterTestScans(ctx: RosterTestContext): SignInRosterScanPort {
	const owned = (rosterId: string, path: string | null) =>
		path?.startsWith(`${ctx.auth.orgId}/sign-in-rosters/${rosterId}/`) ?? true;
	const retire = (path: string | null): Promise<FileCleanup> =>
		path
			? ctx.storage.remove(SENSITIVE_FILE_BUCKET, [path]).then(
					() => 'complete',
					() => 'pending'
				)
			: Promise.resolve('complete');
	async function lock(rosterId: string) {
		const row = await ctx.rawStore.findOne<RosterRow>('sign_in_rosters', ctx.auth.orgId, { id: rosterId });
		if (!row || !visibleRoster(ctx, row)) fail(404, 'This roster is no longer available.');
		if (!owned(rosterId, row.signed_file_path))
			fail(400, "This roster's signed scan uses an unsupported storage location");
		return row;
	}
	const setPointer = (rosterId: string, path: string | null) =>
		ctx.store.update('sign_in_rosters', ctx.auth.orgId, rosterId, { signed_file_path: path });
	return {
		async replace(_actor, rosterId, path, file) {
			if (!owned(rosterId, path)) fail(400, 'Scan path is outside the authorized roster');
			if (!(file instanceof File)) fail(400, 'A scan file is required');
			await lock(rosterId);
			await ctx.storage.upload(SENSITIVE_FILE_BUCKET, path, file, { upsert: false });
			const { signed_file_path: displaced } = await lock(rosterId);
			await setPointer(rosterId, path);
			await retire(displaced);
		},
		async remove(_actor, rosterId, expectedPath) {
			const { signed_file_path: current } = await lock(rosterId);
			if (current === null) return 'complete';
			if (current !== expectedPath) fail(409, 'This signed scan changed. Reload to review it.');
			await setPointer(rosterId, null);
			return retire(current);
		},
		async deleteRoster(_actor, rosterId) {
			const row = await lock(rosterId);
			await ctx.store.delete('sign_in_rosters', ctx.auth.orgId, rosterId);
			return { title: row.title, fileCleanup: await retire(row.signed_file_path) };
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
		listGroupCatalog: () => listGroupCatalog({ groups: ctx.groups }),
		loadRankCatalog: () =>
			loadOrganizationRankCatalog(
				{ auth: ctx.auth, rankCatalog: ctx.rankCatalog },
				{ authorization: 'training-records' }
			)
	};
}

export function selectRosterUploadContext(ctx: RosterTestContext) {
	return { ...selectRosterContext(ctx), actor: ctx.auth, scans: createRosterTestScans(ctx) };
}
