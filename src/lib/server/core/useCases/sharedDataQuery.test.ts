import { describe, it, expect, vi } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard
} from '$lib/server/adapters/inMemory';
import { createScopedDataStore } from '$lib/server/adapters/scopedDataStore';
import type { GroupScopeRule } from '$lib/server/core/ports';
import { fetchSharedData } from './sharedDataQuery';

const ORG = 'test-org';

function buildCtx(overrides?: { auth?: Parameters<typeof createTestAuthContext>[0] }) {
	const store = createInMemoryDataStore();
	const auditPort = createTestAuditPort();
	return {
		store,
		rawStore: store,
		auth: createTestAuthContext({ orgId: ORG, ...overrides?.auth }),
		audit: auditPort,
		auditPort,
		readOnlyGuard: createTestReadOnlyGuard()
	};
}

function seedPersonnel(store: ReturnType<typeof createInMemoryDataStore>) {
	store.seed('personnel', [
		{
			id: 'p1',
			organization_id: ORG,
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'John',
			mos: '11B',
			clinic_role: 'Medic',
			group_id: 'g1',
			groups: { name: 'Alpha' },
			archived_at: null
		},
		{
			id: 'p2',
			organization_id: ORG,
			rank: 'CPL',
			last_name: 'Jones',
			first_name: 'Jane',
			mos: '68W',
			clinic_role: 'Nurse',
			group_id: 'g2',
			groups: { name: 'Bravo' },
			archived_at: null
		}
	]);
}

function seedGroups(store: ReturnType<typeof createInMemoryDataStore>) {
	store.seed('groups', [
		{ id: 'g1', organization_id: ORG, name: 'Alpha', sort_order: 0 },
		{ id: 'g2', organization_id: ORG, name: 'Bravo', sort_order: 1 }
	]);
}

function seedStatusTypes(store: ReturnType<typeof createInMemoryDataStore>) {
	store.seed('status_types', [
		{ id: 'st1', organization_id: ORG, name: 'Leave', color: '#ff0', text_color: '#000', sort_order: 0 }
	]);
}

function seedTrainingTypes(store: ReturnType<typeof createInMemoryDataStore>) {
	store.seed('training_types', [
		{
			id: 'tt1',
			organization_id: ORG,
			name: 'CPR',
			description: 'CPR cert',
			expiration_months: 12,
			warning_days_yellow: 30,
			warning_days_orange: 14,
			required_for_roles: [],
			color: '#0f0',
			sort_order: 0,
			expiration_date_only: false,
			can_be_exempted: false,
			exempt_personnel_ids: []
		}
	]);
}

function seedAll(store: ReturnType<typeof createInMemoryDataStore>) {
	seedPersonnel(store);
	seedGroups(store);
	seedStatusTypes(store);
	seedTrainingTypes(store);
}

describe('fetchSharedData', () => {
	it('calls requireView for personnel permission', async () => {
		const ctx = buildCtx();
		const spy = vi.spyOn(ctx.auth, 'requireView');
		seedAll(ctx.store);

		await fetchSharedData(ctx);

		expect(spy).toHaveBeenCalledWith('personnel');
	});

	it('transforms personnel rows with groupName from entity', async () => {
		const ctx = buildCtx();
		seedAll(ctx.store);

		const result = await fetchSharedData(ctx);

		const smith = result.personnel.find((p) => p.lastName === 'Smith');
		expect(smith).toBeDefined();
		expect(smith!.groupName).toBe('Alpha');
		expect(smith!.firstName).toBe('John');
		expect(smith!.rank).toBe('SGT');
	});

	it('transforms groups, statusTypes, and trainingTypes from snake_case', async () => {
		const ctx = buildCtx();
		seedAll(ctx.store);

		const result = await fetchSharedData(ctx);

		expect(result.groups[0]).toMatchObject({ id: 'g1', name: 'Alpha', sortOrder: 0 });
		expect(result.statusTypes[0]).toMatchObject({ id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' });
		expect(result.trainingTypes[0]).toMatchObject({
			id: 'tt1',
			name: 'CPR',
			expirationMonths: 12,
			warningDaysYellow: 30,
			canBeExempted: false
		});
	});

	it('excludes archived personnel', async () => {
		const ctx = buildCtx();
		seedAll(ctx.store);
		// Add an archived person
		ctx.store.seed('personnel', [
			{
				id: 'p-archived',
				organization_id: ORG,
				rank: 'PVT',
				last_name: 'Gone',
				first_name: 'Long',
				mos: '11B',
				clinic_role: '',
				group_id: 'g1',
				groups: { name: 'Alpha' },
				archived_at: '2026-01-01T00:00:00Z'
			}
		]);

		const result = await fetchSharedData(ctx);

		expect(result.personnel).toHaveLength(2);
		expect(result.allPersonnel).toHaveLength(2);
		expect(result.personnel.every((p) => p.id !== 'p-archived')).toBe(true);
	});

	it('returns personnel, groups, statusTypes, and trainingTypes', async () => {
		const ctx = buildCtx();
		seedAll(ctx.store);

		const result = await fetchSharedData(ctx);

		expect(result.personnel).toHaveLength(2);
		expect(result.allPersonnel).toHaveLength(2);
		expect(result.groups).toHaveLength(2);
		expect(result.statusTypes).toHaveLength(1);
		expect(result.trainingTypes).toHaveLength(1);
	});

	it('scoped member sees only their group personnel, allPersonnel sees everyone', async () => {
		const scopeRules = new Map<string, GroupScopeRule>([['personnel', { type: 'group', groupColumn: 'group_id' }]]);
		const rawStore = createInMemoryDataStore();
		const scopedStore = createScopedDataStore(rawStore, 'g1', scopeRules);
		seedAll(rawStore);

		const ctx = {
			store: scopedStore,
			rawStore,
			auth: createTestAuthContext({
				orgId: ORG,
				role: 'member',
				isPrivileged: false,
				scopedGroupId: 'g1'
			}),
			audit: createTestAuditPort(),
			readOnlyGuard: createTestReadOnlyGuard()
		};

		const result = await fetchSharedData(ctx);

		// Scoped: only group g1 personnel
		expect(result.personnel).toHaveLength(1);
		expect(result.personnel[0].lastName).toBe('Smith');

		// Unscoped: all personnel
		expect(result.allPersonnel).toHaveLength(2);
	});

	it('unscoped admin gets personnel === allPersonnel', async () => {
		const ctx = buildCtx();
		seedAll(ctx.store);

		const result = await fetchSharedData(ctx);

		expect(result.personnel).toEqual(result.allPersonnel);
	});
});
