import { findGroupNamesByIds, loadOrganizationRankCatalog } from '$features/personnel/index.server';
import type { SignInRosterPersonnelLookupPort } from '$features/personnel/contracts';
import { createSignInRosterPersistence } from '$features/sign-in-rosters/index.server';
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

export function selectRosterContext(ctx: RosterTestContext) {
	return {
		orgId: ctx.auth.orgId,
		persistence: createSignInRosterPersistence(ctx.store, ctx.auth.orgId),
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
		findGroupNamesByIds: (groupIds: string[]) => findGroupNamesByIds({ auth: ctx.auth, store: ctx.rawStore }, groupIds),
		loadRankCatalog: () =>
			loadOrganizationRankCatalog({ auth: ctx.auth, store: ctx.rawStore }, { authorization: 'training-records' })
	};
}

export function selectRosterUploadContext(ctx: RosterTestContext) {
	return { ...selectRosterContext(ctx), actor: ctx.auth, fileWrites: ctx.signInRosterFileWrites };
}
