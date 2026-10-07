import { loadOrganizationRankCatalog } from '$features/personnel/index.server';
import {
	createTestContext as memoryTest,
	createWritePortsContext as memoryWrite,
	createWriteWithNotificationsPortsContext as memoryNotifications,
	createQueryPortsContext as memoryQuery,
	createQueryWithRawStorePortsContext as memoryRawQuery,
	withTrainingPersistence
} from '$features/training/server/trainingPersistence.test-support.server';
import {
	createInMemoryOnboardingCatalogPersistence,
	createInMemoryOnboardingWorkflowPersistence
} from './inMemoryOnboardingPersistence.server';
type Options = Parameters<typeof memoryTest>[0];
export function withOnboardingPersistence(options?: Options) {
	return {
		...withTrainingPersistence(options),
		onboardingCatalogFactory: createInMemoryOnboardingCatalogPersistence,
		onboardingWorkflowFactory: createInMemoryOnboardingWorkflowPersistence
	};
}
export function createTestContext(options?: Options) {
	const ctx = memoryTest(withOnboardingPersistence(options));
	return {
		...ctx,
		loadRankCatalog: () =>
			loadOrganizationRankCatalog({ auth: ctx.auth, audit: ctx.audit, store: ctx.store, rawStore: ctx.rawStore })
	};
}
export function createWritePortsContext(options?: Options) {
	const ctx = memoryWrite(withOnboardingPersistence(options));
	return {
		...ctx,
		loadRankCatalog: () =>
			loadOrganizationRankCatalog({ auth: ctx.auth, audit: ctx.audit, store: ctx.store, rawStore: ctx.rawStore })
	};
}
export function createQueryPortsContext(options?: Options) {
	const ctx = memoryQuery(withOnboardingPersistence(options));
	return {
		...ctx,
		loadRankCatalog: () => loadOrganizationRankCatalog({ auth: ctx.auth, store: ctx.store })
	};
}
export function createQueryWithRawStorePortsContext(options?: Options) {
	const ctx = memoryRawQuery(withOnboardingPersistence(options));
	return {
		...ctx,
		loadRankCatalog: () => loadOrganizationRankCatalog({ auth: ctx.auth, store: ctx.store, rawStore: ctx.rawStore })
	};
}
export {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestScopeEnforcementPort
} from '$lib/server/adapters/inMemory';

export function createWriteWithNotificationsPortsContext(options?: Options) {
	return memoryNotifications(withOnboardingPersistence(options));
}
