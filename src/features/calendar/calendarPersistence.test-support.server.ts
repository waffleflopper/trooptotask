import {
	createTestContext as createMemoryTestContext,
	createWritePortsContext as createMemoryWriteContext,
	createWriteWithNotificationsPortsContext as createMemoryNotificationContext,
	createQueryPortsContext as createMemoryQueryContext,
	createQueryWithRawStorePortsContext as createMemoryRawQueryContext
} from '$lib/server/adapters/inMemory';
import {
	createInMemoryCalendarCatalogPersistence,
	createInMemoryCalendarAvailabilityPersistence,
	createInMemoryCalendarAssignmentReader
} from './inMemoryCalendarPersistence.server';

type Options = Parameters<typeof createMemoryTestContext>[0];

export function withCalendarPersistence(options?: Options) {
	return {
		...options,
		calendarCatalogsFactory: createInMemoryCalendarCatalogPersistence,
		calendarAssignmentsFactory: createInMemoryCalendarAssignmentReader,
		calendarAvailabilityFactory: (store, auth, removal) =>
			createInMemoryCalendarAvailabilityPersistence(store, {
				orgId: auth.orgId,
				removal,
				scopeSet: auth.scopeSet,
				loadScopedPersonnelIds: async () => {
					if (auth.scopeSet.kind === 'groups' && auth.scopeSet.groupIds.length === 0) return [];
					const rows = await store.findMany<{ id: string }>(
						'personnel',
						auth.orgId,
						undefined,
						auth.scopeSet.kind === 'groups' ? { inFilters: { group_id: [...auth.scopeSet.groupIds] } } : undefined
					);
					return rows.map((row) => row.id);
				}
			})
	} satisfies NonNullable<Options>;
}

export function createTestContext(options?: Options) {
	return createMemoryTestContext(withCalendarPersistence(options));
}

export function createWritePortsContext(options?: Options) {
	return createMemoryWriteContext(withCalendarPersistence(options));
}

export function createWriteWithNotificationsPortsContext(options?: Options) {
	return createMemoryNotificationContext(withCalendarPersistence(options));
}

export function createQueryPortsContext(options?: Options) {
	return createMemoryQueryContext(withCalendarPersistence(options));
}

export function createQueryWithRawStorePortsContext(options?: Options) {
	return createMemoryRawQueryContext(withCalendarPersistence(options));
}
