import type { DataStore } from '$lib/server/core/ports';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { loadOrganizationRankCatalog } from './rankCatalogOperations.server';
import {
	createInMemoryPersonnelRecordPersistence,
	createInMemoryPersonnelRosterReader,
	createInMemoryGroupPersistence,
	createInMemorySelfPinPersistence
} from './inMemoryPersonnelPersistence.server';
export function withPersonnelPersistence<
	T extends { auth: OrganizationAccessGrant; store: DataStore; rawStore?: DataStore }
>(ctx: T) {
	const ordinary = ctx.rawStore ?? ctx.store;
	return {
		...ctx,
		personnel: createInMemoryPersonnelRecordPersistence(ctx.store, ctx.auth.orgId),
		organizationPersonnel: createInMemoryPersonnelRecordPersistence(ordinary, ctx.auth.orgId),
		roster: createInMemoryPersonnelRosterReader(ctx.store, ctx.auth.orgId),
		organizationRoster: createInMemoryPersonnelRosterReader(ordinary, ctx.auth.orgId),
		groups: createInMemoryGroupPersistence(ctx.store, ctx.auth.orgId),
		selfPins: createInMemorySelfPinPersistence(ctx.store, ctx.auth.orgId, ctx.auth.userId),
		loadRankCatalog: () => loadOrganizationRankCatalog(ctx)
	};
}
