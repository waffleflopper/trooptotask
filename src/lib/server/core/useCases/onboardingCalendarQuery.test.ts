import { describe, it, expect } from 'vitest';
import { getActiveOnboardingPersonnelIds } from './onboardingCalendarQuery';
import { createInMemoryDataStore, createQueryPortsContext } from '../../adapters/inMemory';
import type { QueryPorts } from '../ports';

function makeCtx(overrides?: { store?: ReturnType<typeof createInMemoryDataStore> }): QueryPorts & {
	store: ReturnType<typeof createInMemoryDataStore>;
} {
	const ctx = createQueryPortsContext();
	if (overrides?.store) {
		return { ...ctx, store: overrides.store };
	}
	return ctx;
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
