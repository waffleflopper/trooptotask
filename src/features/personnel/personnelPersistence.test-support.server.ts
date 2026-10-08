import type { RankCatalogPersistence } from './rankCatalogPersistence';
import type { PersonnelMemoryStore } from './inMemoryPersonnelPersistence.server';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { loadOrganizationRankCatalog } from './rankCatalogOperations.server';
import {
	createInMemoryPersonnelRecordPersistence,
	createInMemoryPersonnelRosterReader,
	createInMemoryGroupPersistence,
	createInMemorySelfPinPersistence
} from './inMemoryPersonnelPersistence.server';
export function withPersonnelPersistence<
	T extends {
		auth: OrganizationAccessGrant;
		store: PersonnelMemoryStore;
		rawStore?: PersonnelMemoryStore;
		rankCatalog: Pick<RankCatalogPersistence, 'listEntries'>;
	}
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
		loadRankCatalog: () => loadOrganizationRankCatalog({ auth: ctx.auth, rankCatalog: ctx.rankCatalog })
	};
}
