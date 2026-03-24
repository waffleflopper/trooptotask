import { describe, it, expect } from 'vitest';
import { getActiveOnboardingPersonnelIds } from './onboardingCalendarQuery';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort,
	createTestNotificationPort,
	createTestBillingPort
} from '../../adapters/inMemory';
import type { UseCaseContext } from '../ports';

function makeCtx(overrides?: { store?: ReturnType<typeof createInMemoryDataStore> }): UseCaseContext {
	const store = overrides?.store ?? createInMemoryDataStore();
	return {
		store,
		rawStore: store,
		auth: createTestAuthContext(),
		audit: createTestAuditPort(),
		readOnlyGuard: createTestReadOnlyGuard(),
		subscription: createTestSubscriptionPort(),
		notifications: createTestNotificationPort(),
		billing: createTestBillingPort()
	};
}

describe('getActiveOnboardingPersonnelIds', () => {
	it('returns personnel IDs for in_progress onboardings', async () => {
		const store = createInMemoryDataStore();
		store.seed('personnel_onboardings', [
			{ id: 'ob-1', organization_id: 'test-org', personnel_id: 'p-1', status: 'in_progress' },
			{ id: 'ob-2', organization_id: 'test-org', personnel_id: 'p-2', status: 'in_progress' }
		]);
		const ctx = makeCtx({ store });

		const result = await getActiveOnboardingPersonnelIds(ctx);

		expect(result).toEqual(expect.arrayContaining(['p-1', 'p-2']));
		expect(result).toHaveLength(2);
	});

	it('excludes cancelled and completed onboardings', async () => {
		const store = createInMemoryDataStore();
		store.seed('personnel_onboardings', [
			{ id: 'ob-1', organization_id: 'test-org', personnel_id: 'p-1', status: 'in_progress' },
			{ id: 'ob-2', organization_id: 'test-org', personnel_id: 'p-2', status: 'cancelled' },
			{ id: 'ob-3', organization_id: 'test-org', personnel_id: 'p-3', status: 'completed' }
		]);
		const ctx = makeCtx({ store });

		const result = await getActiveOnboardingPersonnelIds(ctx);

		expect(result).toEqual(['p-1']);
	});

	it('returns empty array when no active onboardings exist', async () => {
		const ctx = makeCtx();

		const result = await getActiveOnboardingPersonnelIds(ctx);

		expect(result).toEqual([]);
	});

	it('deduplicates personnel with multiple active onboardings', async () => {
		const store = createInMemoryDataStore();
		store.seed('personnel_onboardings', [
			{ id: 'ob-1', organization_id: 'test-org', personnel_id: 'p-1', status: 'in_progress' },
			{ id: 'ob-2', organization_id: 'test-org', personnel_id: 'p-1', status: 'in_progress' }
		]);
		const ctx = makeCtx({ store });

		const result = await getActiveOnboardingPersonnelIds(ctx);

		expect(result).toEqual(['p-1']);
	});
});
