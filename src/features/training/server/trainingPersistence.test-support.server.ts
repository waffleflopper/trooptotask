import { loadOrganizationRankCatalog } from '$features/personnel/index.server';
import {
	createTestContext as createMemoryTestContext,
	createWritePortsContext as createMemoryWriteContext,
	createWriteWithNotificationsPortsContext as createMemoryNotificationContext,
	createQueryPortsContext as createMemoryQueryContext,
	createQueryWithRawStorePortsContext as createMemoryRawQueryContext
} from '$lib/server/adapters/inMemory';
import {
	createInMemoryTrainingCatalogPersistence,
	createInMemoryTrainingCompletionPersistence
} from './inMemoryTrainingPersistence.server';

type Options = Parameters<typeof createMemoryTestContext>[0];
export function withTrainingPersistence(options?: Options) {
	return {
		...options,
		trainingCatalogFactory: createInMemoryTrainingCatalogPersistence,
		trainingCompletionsFactory: createInMemoryTrainingCompletionPersistence
	} satisfies NonNullable<Options>;
}

export function createTestContext(options?: Options) {
	const ctx = createMemoryTestContext(withTrainingPersistence(options));
	return { ...ctx, loadRankCatalog: () => loadOrganizationRankCatalog(ctx, { authorization: 'training-view' }) };
}

export function createWritePortsContext(options?: Options) {
	const ctx = createMemoryWriteContext(withTrainingPersistence(options));
	return { ...ctx, loadRankCatalog: () => loadOrganizationRankCatalog(ctx, { authorization: 'training-view' }) };
}

export function createWriteWithNotificationsPortsContext(options?: Options) {
	const ctx = createMemoryNotificationContext(withTrainingPersistence(options));
	return { ...ctx, loadRankCatalog: () => loadOrganizationRankCatalog(ctx, { authorization: 'training-view' }) };
}

export function createQueryPortsContext(options?: Options) {
	const ctx = createMemoryQueryContext(withTrainingPersistence(options));
	return { ...ctx, loadRankCatalog: () => loadOrganizationRankCatalog(ctx, { authorization: 'training-view' }) };
}

export function createQueryWithRawStorePortsContext(options?: Options) {
	const ctx = createMemoryRawQueryContext(withTrainingPersistence(options));
	return { ...ctx, loadRankCatalog: () => loadOrganizationRankCatalog(ctx, { authorization: 'training-view' }) };
}

export {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestScopeEnforcementPort
} from '$lib/server/adapters/inMemory';
