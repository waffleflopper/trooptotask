import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	configureOrganizationRankServices,
	loadOrganizationRankCatalog,
	reactivateOrganizationRankCatalogEntry
} from './rankCatalogOperations.server';
import type { OrganizationRankCatalogEntry } from './rankCatalogContracts';

function serviceStates(catalog: OrganizationRankCatalogEntry[]) {
	const states = new Map<string, Set<string>>();
	for (const entry of catalog) {
		const service = states.get(entry.service) ?? new Set<string>();
		service.add(entry.state);
		states.set(entry.service, service);
	}
	return Object.fromEntries([...states].map(([service, values]) => [service, [...values].sort()]));
}

describe('Organization rank service selection', () => {
	it('installs Army on a fresh catalog, switches to Navy and back without losing ranks or people', async () => {
		const ctx = createTestContext({ auth: { role: 'admin' } });
		ctx.rawStore.seed('personnel', [
			{ id: 'person-1', organization_id: 'test-org', rank: 'SGT', first_name: 'Alex', last_name: 'Morgan' }
		]);
		await configureOrganizationRankServices(ctx, { service: 'army' });
		expect(serviceStates(await loadOrganizationRankCatalog(ctx))).toEqual({ army: ['active'] });
		expect(await ctx.rankCatalog.findEntryByCode('GEN')).toMatchObject({ state: 'active', source: 'built-in' });
		const sergeant = await ctx.rankCatalog.findEntryByCode('SGT');

		await configureOrganizationRankServices(ctx, { service: 'navy' });
		expect(serviceStates(await loadOrganizationRankCatalog(ctx))).toEqual({ army: ['retired'], navy: ['active'] });
		expect(await ctx.rankCatalog.findEntryByCode('SGT')).toEqual({ ...sergeant, state: 'retired' });
		expect(await ctx.rankCatalog.findEntryByCode('PO3')).toMatchObject({ state: 'active', source: 'built-in' });
		expect(await ctx.rawStore.findOne('personnel', 'test-org', { id: 'person-1' })).toMatchObject({ rank: 'SGT' });

		await configureOrganizationRankServices(ctx, { service: 'army' });
		expect(serviceStates(await loadOrganizationRankCatalog(ctx))).toEqual({ army: ['active'], navy: ['retired'] });
		expect(await ctx.rankCatalog.findEntryByCode('SGT')).toEqual(sergeant);
		await reactivateOrganizationRankCatalogEntry(ctx, { code: 'PO3' });
		expect(await ctx.rankCatalog.findEntryByCode('PO3')).toMatchObject({ state: 'active', source: 'built-in' });
	});

	it('preserves custom and discovered ranks and both active and retired civilian ranks', async () => {
		const ctx = createTestContext();
		await ctx.rankCatalog.saveEntries([
			{
				code: 'CIV',
				label: 'Civilian',
				service: 'civilian',
				category: 'civilian',
				pay_grade: 'ungraded',
				state: 'active',
				source: 'built-in',
				sort_order: 0
			},
			{
				code: 'CIV-2',
				label: 'Civilian grade 2',
				service: 'civilian',
				category: 'civilian',
				pay_grade: 'ungraded',
				state: 'retired',
				source: 'custom',
				sort_order: 0
			},
			{
				code: 'DET-SGT',
				label: 'Detachment sergeant',
				service: 'army',
				category: 'custom',
				pay_grade: 'E-5',
				state: 'active',
				source: 'custom',
				sort_order: 0
			},
			{
				code: 'LEGACY',
				label: 'Legacy',
				service: 'custom',
				category: 'custom',
				pay_grade: 'ungraded',
				state: 'retired',
				source: 'discovered',
				sort_order: 0
			}
		]);
		const before = await ctx.rankCatalog.listEntries();
		await configureOrganizationRankServices(ctx, { service: 'navy' });
		const after = await ctx.rankCatalog.listEntries();
		expect(before.map((entry) => after.find((row) => row.code === entry.code))).toEqual(before);
		expect(after.filter((entry) => entry.service === 'navy').map((entry) => entry.state)).toContain('active');
		expect(await ctx.rankCatalog.findEntryByCode('PO3')).toMatchObject({ state: 'active' });
	});

	it('activates all six military packs for a mixed unit and retires all five others for one service', async () => {
		const ctx = createTestContext();
		await configureOrganizationRankServices(ctx, { service: 'custom' });
		expect(serviceStates(await loadOrganizationRankCatalog(ctx))).toEqual({
			army: ['active'],
			navy: ['active'],
			'air-force': ['active'],
			'marine-corps': ['active'],
			'coast-guard': ['active'],
			'space-force': ['active']
		});
		await configureOrganizationRankServices(ctx, { service: 'space-force' });
		expect(serviceStates(await loadOrganizationRankCatalog(ctx))).toEqual({
			army: ['retired'],
			navy: ['retired'],
			'air-force': ['retired'],
			'marine-corps': ['retired'],
			'coast-guard': ['retired'],
			'space-force': ['active']
		});
		await configureOrganizationRankServices(ctx, { service: 'custom' });
		expect(serviceStates(await loadOrganizationRankCatalog(ctx))).toEqual({
			army: ['active'],
			navy: ['active'],
			'air-force': ['active'],
			'marine-corps': ['active'],
			'coast-guard': ['active'],
			'space-force': ['active']
		});
	});

	it('does not rewrite catalog rows when the same service is saved again', async () => {
		const ctx = createTestContext();
		await configureOrganizationRankServices(ctx, { service: 'army' });
		const before = await ctx.rankCatalog.listEntries();
		const saveEntries = ctx.rankCatalog.saveEntries;
		ctx.rankCatalog.saveEntries = async (entries) => {
			if (entries.length) throw new Error('Repeated selection must not write ranks');
			return saveEntries(entries);
		};
		await configureOrganizationRankServices(ctx, { service: 'army' });
		expect(await ctx.rankCatalog.listEntries()).toEqual(before);
		expect(await ctx.rankCatalog.findEntryByCode('SGT')).toMatchObject({ state: 'active' });
	});

	it('allows an admin without Personnel access and denies a member before any rank writes', async () => {
		const ctx = createTestContext({ auth: { role: 'admin', capabilities: { personnel: 'none' } } });
		await configureOrganizationRankServices(ctx, { service: 'navy' });
		expect(await ctx.rankCatalog.findEntryByCode('PO3')).toMatchObject({ state: 'active' });
		const member = createTestContext({ auth: { role: 'member' } });
		await expect(configureOrganizationRankServices(member, { service: 'navy' })).rejects.toMatchObject({ status: 403 });
		expect(await member.rankCatalog.listEntries()).toEqual([]);
	});
});
