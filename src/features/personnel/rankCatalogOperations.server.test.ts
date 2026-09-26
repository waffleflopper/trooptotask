import { describe, expect, it, vi } from 'vitest';
import { BUILT_IN_RANK_CATALOG } from '$features/personnel/contracts';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	addOrganizationRankServicePack,
	bulkSetOrganizationRankCatalogState,
	buildDefaultRankCatalogSeeds,
	ensureOrganizationRankCatalog,
	loadOrganizationRankCatalog,
	loadOrganizationRankCatalogReferenceSummaries,
	reactivateOrganizationRankCatalogEntry,
	removeOrganizationRankCatalogEntry,
	retireOrganizationRankCatalogEntry,
	saveOrganizationRankCatalogEntry
} from './rankCatalogOperations.server';

const DEFAULT_SEEDED_RANK_SERVICES = new Set(['army', 'civilian', 'custom']);
const DEFAULT_SEEDED_RANK_COUNT = BUILT_IN_RANK_CATALOG.filter((entry) =>
	DEFAULT_SEEDED_RANK_SERVICES.has(entry.service)
).length;

const NO_CAPABILITIES = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
} as const;

function withAtomicDelete(ctx: ReturnType<typeof createTestContext>) {
	return {
		...ctx,
		rankCatalogAdministration: {
			async deleteRankCatalogEntry(orgId: string, entryId: string): Promise<void> {
				await ctx.rawStore.delete('organization_rank_catalog', orgId, entryId);
			}
		}
	};
}

describe('organization rank catalog', () => {
	it('seeds built-in defaults and returns the Organization catalog without rewriting Personnel rank strings', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'SGT',
				first_name: 'Alex',
				last_name: 'Morgan'
			}
		]);

		const catalog = await ensureOrganizationRankCatalog(ctx);
		const loaded = await loadOrganizationRankCatalog(ctx);

		expect(catalog).toHaveLength(DEFAULT_SEEDED_RANK_COUNT);
		expect(loaded.find((entry) => entry.code === 'GEN')).toMatchObject({
			organizationId: 'test-org',
			code: 'GEN',
			label: 'General',
			service: 'army',
			category: 'officer',
			payGrade: 'O-10',
			state: 'active',
			source: 'built-in'
		});
		expect(loaded.map((entry) => entry.code)).toContain('SGT');
		await expect(ctx.rawStore.findOne('personnel', 'test-org', { id: 'person-1' })).resolves.toMatchObject({
			rank: 'SGT'
		});
	});

	it('keeps non-default military service packs opt-in when seeding defaults', () => {
		const seeds = buildDefaultRankCatalogSeeds('test-org');

		expect(new Set(seeds.map((entry) => entry.service))).toEqual(DEFAULT_SEEDED_RANK_SERVICES);
		expect(seeds).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SGT', service: 'army' })]));
		expect(seeds).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CIV', service: 'civilian' })]));
		expect(seeds).not.toEqual(expect.arrayContaining([expect.objectContaining({ service: 'navy' })]));
		expect(seeds).not.toEqual(expect.arrayContaining([expect.objectContaining({ service: 'air-force' })]));
	});

	it('preserves unknown Personnel rank strings as discovered Organization catalog entries', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'Field Marshal',
				first_name: 'Jamie',
				last_name: 'Rivera'
			},
			{
				id: 'person-2',
				organization_id: 'test-org',
				rank: '  Field Marshal  ',
				first_name: 'Casey',
				last_name: 'Lee'
			},
			{
				id: 'person-3',
				organization_id: 'test-org',
				rank: 'Field   Marshal',
				first_name: 'Riley',
				last_name: 'Jordan'
			}
		]);

		const catalog = await ensureOrganizationRankCatalog(ctx);

		expect(catalog.find((entry) => entry.code === 'Field Marshal')).toMatchObject({
			organizationId: 'test-org',
			code: 'Field Marshal',
			label: 'Field Marshal',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			source: 'discovered'
		});
		expect(catalog.filter((entry) => entry.code === 'Field Marshal')).toHaveLength(1);
		await expect(ctx.rawStore.findOne('personnel', 'test-org', { id: 'person-1' })).resolves.toMatchObject({
			rank: 'Field Marshal'
		});
		await expect(ctx.rawStore.findOne('personnel', 'test-org', { id: 'person-2' })).resolves.toMatchObject({
			rank: '  Field Marshal  '
		});
		await expect(ctx.rawStore.findOne('personnel', 'test-org', { id: 'person-3' })).resolves.toMatchObject({
			rank: 'Field   Marshal'
		});
	});

	it('skips unsafe discovered Personnel rank strings without breaking catalog reconciliation', async () => {
		const ctx = createTestContext();
		const overlongRank = 'X'.repeat(200);
		ctx.rawStore.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: overlongRank,
				first_name: 'Jamie',
				last_name: 'Rivera'
			},
			{
				id: 'person-2',
				organization_id: 'test-org',
				rank: '    ',
				first_name: 'Casey',
				last_name: 'Lee'
			}
		]);

		const catalog = await ensureOrganizationRankCatalog(ctx);

		expect(catalog).toHaveLength(DEFAULT_SEEDED_RANK_COUNT);
		expect(catalog).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: overlongRank })]));
		expect(catalog).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'X'.repeat(80) })]));
	});

	it('preserves Personnel rank strings from uninstalled service packs as discovered entries', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'capt',
				first_name: 'Jamie',
				last_name: 'Rivera'
			},
			{
				id: 'person-2',
				organization_id: 'test-org',
				rank: 'po3',
				first_name: 'Casey',
				last_name: 'Lee'
			}
		]);

		const catalog = await ensureOrganizationRankCatalog(ctx);

		expect(catalog).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: 'capt', source: 'discovered' }),
				expect.objectContaining({ code: 'po3', source: 'discovered' })
			])
		);
		expect(catalog).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CAPT' })]));
		expect(catalog).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'Capt' })]));
	});

	it('does not discover case-only variants of default seeded rank codes', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'sgt',
				first_name: 'Jamie',
				last_name: 'Rivera'
			}
		]);

		const catalog = await ensureOrganizationRankCatalog(ctx);

		expect(catalog).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SGT' })]));
		expect(catalog).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'sgt' })]));
	});

	it('uses Personnel roster-view semantics for catalog reads', async () => {
		const ownerCtx = createTestContext();
		await ensureOrganizationRankCatalog(ownerCtx);

		const rosterViewerCtx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: { ...NO_CAPABILITIES, personnel: 'view' }
			}
		});
		rosterViewerCtx.rawStore.seed(
			'organization_rank_catalog',
			await ownerCtx.rawStore.findMany('organization_rank_catalog', 'test-org')
		);

		await expect(loadOrganizationRankCatalog(rosterViewerCtx)).resolves.toEqual(
			expect.arrayContaining([expect.objectContaining({ code: 'SGT' })])
		);

		const blockedCtx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: NO_CAPABILITIES
			}
		});
		blockedCtx.rawStore.seed(
			'organization_rank_catalog',
			await ownerCtx.rawStore.findMany('organization_rank_catalog', 'test-org')
		);

		await expect(loadOrganizationRankCatalog(blockedCtx)).rejects.toMatchObject({
			status: 403,
			message: 'You do not have permission to use personnel data'
		});
	});

	it('supports Training and Organization governance authorization for rank catalog reads', async () => {
		const ownerCtx = createTestContext();
		await ensureOrganizationRankCatalog(ownerCtx);
		const catalogRows = await ownerCtx.rawStore.findMany<Record<string, unknown>>(
			'organization_rank_catalog',
			'test-org'
		);
		const trainingViewerCtx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: { ...NO_CAPABILITIES, training: 'view' }
			}
		});
		trainingViewerCtx.rawStore.seed('organization_rank_catalog', catalogRows);
		const settingsAdminCtx = createTestContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
				canManageMembers: true,
				capabilityMap: NO_CAPABILITIES
			}
		});
		settingsAdminCtx.rawStore.seed('organization_rank_catalog', catalogRows);

		await expect(loadOrganizationRankCatalog(trainingViewerCtx, { authorization: 'training-view' })).resolves.toEqual(
			expect.arrayContaining([expect.objectContaining({ code: 'SGT' })])
		);
		await expect(
			loadOrganizationRankCatalog(settingsAdminCtx, { authorization: 'organization-governance' })
		).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SGT' })]));
		await expect(loadOrganizationRankCatalog(settingsAdminCtx)).rejects.toMatchObject({
			status: 403,
			message: 'You do not have permission to use personnel data'
		});
	});

	it('does not let roster-view-only users trigger rank catalog seed writes', async () => {
		const rosterViewerCtx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: { ...NO_CAPABILITIES, personnel: 'view' }
			}
		});
		rosterViewerCtx.rawStore.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'Field Marshal',
				first_name: 'Jamie',
				last_name: 'Rivera'
			}
		]);

		await expect(ensureOrganizationRankCatalog(rosterViewerCtx)).rejects.toMatchObject({
			status: 403,
			message: 'This action requires an organization admin or owner role'
		});
		await expect(loadOrganizationRankCatalog(rosterViewerCtx)).resolves.toEqual([]);
		expect(rosterViewerCtx.auditPort.events).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ action: 'organization.rank_catalog.reconciled' })])
		);
	});

	it('lets Organization admins trigger rank catalog seed writes', async () => {
		const adminCtx = createTestContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
				canManageMembers: true
			}
		});

		const catalog = await ensureOrganizationRankCatalog(adminCtx);

		expect(catalog).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SGT' })]));
		expect(adminCtx.auditPort.events).toEqual([
			{
				action: 'organization.rank_catalog.reconciled',
				resourceType: 'organization_rank_catalog',
				resourceId: 'test-org',
				details: {
					defaultCount: DEFAULT_SEEDED_RANK_COUNT,
					discoveredCount: 0
				}
			}
		]);
	});

	it('adds a built-in service pack without rewriting Personnel rank strings or duplicating existing codes', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'PO3',
				first_name: 'Jamie',
				last_name: 'Rivera'
			}
		]);
		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'ADM',
			label: 'Existing Admiral',
			service: 'navy',
			category: 'officer',
			payGrade: 'O-10',
			state: 'active',
			sortOrder: 9
		});
		ctx.auditPort.events.length = 0;

		const result = await addOrganizationRankServicePack(ctx, { service: 'navy' });
		const loaded = await loadOrganizationRankCatalog(ctx);

		expect(result.addedCount).toBeGreaterThan(0);
		expect(result.skippedExistingCount).toBe(1);
		expect(loaded.filter((entry) => entry.code === 'ADM')).toHaveLength(1);
		expect(loaded.find((entry) => entry.code === 'ADM')).toMatchObject({
			label: 'Admiral',
			source: 'built-in'
		});
		expect(loaded).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'PO3',
					label: 'Petty Officer Third Class',
					service: 'navy',
					source: 'built-in'
				})
			])
		);
		await expect(ctx.rawStore.findOne('personnel', 'test-org', { id: 'person-1' })).resolves.toMatchObject({
			rank: 'PO3'
		});
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'organization.rank_catalog.service_pack_added',
				resourceType: 'organization_rank_catalog',
				resourceId: 'test-org',
				details: expect.objectContaining({
					service: 'navy',
					addedCount: result.addedCount,
					skippedExistingCount: 1
				})
			})
		]);
	});

	it('upgrades discovered ranks to built-in rows when their service pack is added', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'po3',
				first_name: 'Jamie',
				last_name: 'Rivera'
			}
		]);
		await ensureOrganizationRankCatalog(ctx);
		ctx.auditPort.events.length = 0;

		const before = await loadOrganizationRankCatalog(ctx);
		expect(before.find((entry) => entry.code === 'po3')).toMatchObject({
			service: 'custom',
			payGrade: 'ungraded',
			source: 'discovered'
		});

		const result = await addOrganizationRankServicePack(ctx, { service: 'navy' });
		const loaded = await loadOrganizationRankCatalog(ctx);

		expect(result.addedCount).toBeGreaterThan(0);
		expect(result.skippedExistingCount).toBe(0);
		expect(loaded.find((entry) => entry.code === 'po3')).toBeUndefined();
		expect(loaded.filter((entry) => entry.code === 'PO3')).toHaveLength(1);
		expect(loaded.find((entry) => entry.code === 'PO3')).toMatchObject({
			label: 'Petty Officer Third Class',
			service: 'navy',
			payGrade: 'E-4',
			source: 'built-in'
		});
	});

	it('preserves retired state when service packs upgrade discovered rank aliases', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organization_rank_catalog', [
			{
				id: 'rank-po3',
				organization_id: 'test-org',
				code: 'po3',
				label: 'Local PO3',
				service: 'custom',
				category: 'custom',
				pay_grade: 'ungraded',
				state: 'retired',
				source: 'discovered',
				sort_order: 500
			}
		]);

		await addOrganizationRankServicePack(ctx, { service: 'navy' });
		const loaded = await loadOrganizationRankCatalog(ctx);

		expect(loaded.find((entry) => entry.code === 'po3')).toBeUndefined();
		expect(loaded.find((entry) => entry.code === 'PO3')).toMatchObject({
			label: 'Petty Officer Third Class',
			service: 'navy',
			payGrade: 'E-4',
			state: 'retired',
			source: 'built-in'
		});
	});

	it('bulk updates built-in rank state for one service', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organization_rank_catalog', [
			{
				id: 'rank-po3',
				organization_id: 'test-org',
				code: 'PO3',
				label: 'Petty Officer Third Class',
				service: 'navy',
				category: 'enlisted',
				pay_grade: 'E-4',
				state: 'active',
				source: 'built-in',
				sort_order: 0
			},
			{
				id: 'rank-po2',
				organization_id: 'test-org',
				code: 'PO2',
				label: 'Petty Officer Second Class',
				service: 'navy',
				category: 'enlisted',
				pay_grade: 'E-5',
				state: 'active',
				source: 'built-in',
				sort_order: 0
			},
			{
				id: 'rank-custom',
				organization_id: 'test-org',
				code: 'LOCAL',
				label: 'Local Rank',
				service: 'navy',
				category: 'custom',
				pay_grade: 'ungraded',
				state: 'active',
				source: 'custom',
				sort_order: 0
			},
			{
				id: 'rank-army',
				organization_id: 'test-org',
				code: 'SGT',
				label: 'Sergeant',
				service: 'army',
				category: 'enlisted',
				pay_grade: 'E-5',
				state: 'active',
				source: 'built-in',
				sort_order: 0
			}
		]);
		ctx.auditPort.events.length = 0;

		const result = await bulkSetOrganizationRankCatalogState(ctx, { service: 'navy', targetState: 'retired' });
		const loaded = await loadOrganizationRankCatalog(ctx);

		expect(result.changedCount).toBe(2);
		expect(loaded.find((entry) => entry.code === 'PO3')).toMatchObject({ state: 'retired' });
		expect(loaded.find((entry) => entry.code === 'PO2')).toMatchObject({ state: 'retired' });
		expect(loaded.find((entry) => entry.code === 'LOCAL')).toMatchObject({ state: 'active' });
		expect(loaded.find((entry) => entry.code === 'SGT')).toMatchObject({ state: 'active' });
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'organization.rank_catalog.bulk_state_changed',
				resourceType: 'organization_rank_catalog',
				resourceId: 'test-org',
				details: expect.objectContaining({
					service: 'navy',
					targetState: 'retired',
					changedCount: 2
				})
			})
		]);
	});

	it('gates catalog writes with Organization governance instead of Personnel edit permission', async () => {
		const personnelEditorCtx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: { ...NO_CAPABILITIES, personnel: 'configure' }
			}
		});

		await expect(
			saveOrganizationRankCatalogEntry(personnelEditorCtx, {
				code: 'DET-SGT',
				label: 'Detachment Sergeant',
				service: 'custom',
				category: 'custom',
				payGrade: 'ungraded',
				state: 'active',
				sortOrder: 500
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'This action requires an organization admin or owner role'
		});

		const ownerCtx = createTestContext();
		await saveOrganizationRankCatalogEntry(ownerCtx, {
			code: 'DET-SGT',
			label: 'Detachment Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			sortOrder: 500
		});

		await expect(loadOrganizationRankCatalog(ownerCtx)).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'DET-SGT',
					label: 'Detachment Sergeant',
					source: 'custom'
				})
			])
		);
	});

	it('rejects invalid rank catalog mutation fields before persistence or audit', async () => {
		const invalidInputs = [
			{ field: 'service', value: 'army-ish', message: 'Invalid rank service' },
			{ field: 'category', value: 'staff', message: 'Invalid rank category' },
			{ field: 'payGrade', value: 'X-1', message: 'Invalid rank pay grade' },
			{ field: 'payGrade', value: 'E-10', message: 'Invalid rank pay grade' },
			{ field: 'payGrade', value: 'W-6', message: 'Invalid rank pay grade' },
			{ field: 'payGrade', value: 'O-11', message: 'Invalid rank pay grade' },
			{ field: 'state', value: 'inactive', message: 'Invalid rank state' }
		] as const;

		for (const invalidInput of invalidInputs) {
			const ctx = createTestContext();
			await expect(
				saveOrganizationRankCatalogEntry(ctx, {
					code: `BAD-${invalidInput.field}`,
					label: 'Invalid Rank',
					service: 'custom',
					category: 'custom',
					payGrade: 'ungraded',
					state: 'active',
					sortOrder: 500,
					[invalidInput.field]: invalidInput.value
				})
			).rejects.toMatchObject({
				status: 400,
				message: invalidInput.message
			});

			await expect(loadOrganizationRankCatalog(ctx)).resolves.not.toEqual(
				expect.arrayContaining([expect.objectContaining({ code: `BAD-${invalidInput.field}` })])
			);
			expect(ctx.auditPort.events).toEqual([]);
		}
	});

	it('rejects edited rank submissions when the original code no longer matches the target code', async () => {
		const ctx = createTestContext();
		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'DET-SGT',
			label: 'Detachment Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			sortOrder: 500
		});
		ctx.auditPort.events.length = 0;

		await expect(
			saveOrganizationRankCatalogEntry(ctx, {
				code: 'OTHER-SGT',
				originalCode: 'DET-SGT',
				intent: 'update',
				label: 'Other Sergeant',
				service: 'custom',
				category: 'custom',
				payGrade: 'ungraded',
				state: 'active',
				sortOrder: 501
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Rank code cannot be changed from this edit form.'
		});

		await expect(loadOrganizationRankCatalog(ctx)).resolves.not.toEqual(
			expect.arrayContaining([expect.objectContaining({ code: 'OTHER-SGT' })])
		);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('rejects rank sort orders outside the PostgreSQL integer range before persistence', async () => {
		const ctx = createTestContext();

		await expect(
			saveOrganizationRankCatalogEntry(ctx, {
				code: 'DET-SGT',
				label: 'Detachment Sergeant',
				service: 'custom',
				category: 'custom',
				payGrade: 'ungraded',
				state: 'active',
				sortOrder: 2_147_483_648
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Tie-break order must fit within PostgreSQL integer range.'
		});

		await expect(loadOrganizationRankCatalog(ctx)).resolves.not.toEqual(
			expect.arrayContaining([expect.objectContaining({ code: 'DET-SGT' })])
		);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('audits successful rank catalog saves after the entry is persisted', async () => {
		const ctx = createTestContext();

		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'DET-SGT',
			label: 'Detachment Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			sortOrder: 500
		});

		await expect(loadOrganizationRankCatalog(ctx)).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'DET-SGT',
					label: 'Detachment Sergeant',
					source: 'custom'
				})
			])
		);
		const storedRank = await ctx.rawStore.findOne<{ id: string }>('organization_rank_catalog', 'test-org', {
			code: 'DET-SGT'
		});
		expect(storedRank?.id).toBeTruthy();
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'organization.rank_catalog.saved',
				resourceType: 'organization_rank_catalog',
				resourceId: storedRank?.id,
				details: {
					code: 'DET-SGT',
					label: 'Detachment Sergeant',
					payGrade: 'ungraded',
					state: 'active',
					source: 'custom'
				}
			}
		]);
	});

	it('summarizes retained rank references when Duty Roster tables are unavailable', async () => {
		const ctx = createTestContext();
		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'DET-SGT',
			label: 'Detachment Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			sortOrder: 500
		});
		ctx.rawStore.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'DET-SGT',
				first_name: 'Jamie',
				last_name: 'Rivera'
			}
		]);
		ctx.rawStore.seed('training_types', [
			{
				id: 'training-1',
				organization_id: 'test-org',
				name: 'Annual Check',
				applies_to_ranks: ['DET-SGT'],
				excluded_ranks: []
			},
			{
				id: 'training-2',
				organization_id: 'test-org',
				name: 'Screening',
				applies_to_ranks: [],
				excluded_ranks: ['DET-SGT']
			}
		]);

		ctx.rawStore.seed('sign_in_rosters', [
			{
				id: 'sign-in-1',
				organization_id: 'test-org',
				filter_config: { ranks: ['DET-SGT'] },
				personnel_snapshot: [
					{
						id: 'person-1',
						rank: 'DET-SGT',
						name: 'Jamie Rivera'
					}
				]
			}
		]);

		const findMany = ctx.rawStore.findMany.bind(ctx.rawStore);
		vi.spyOn(ctx.rawStore, 'findMany').mockImplementation((table, orgId, filters, options) => {
			if (table.startsWith('duty_')) throw new Error('Duty Roster storage is unavailable');
			return findMany(table, orgId, filters, options);
		});

		const [summary] = await loadOrganizationRankCatalogReferenceSummaries(ctx, { codes: ['DET-SGT'] });

		expect(summary).toMatchObject({
			code: 'DET-SGT',
			activeReferences: {
				personnel: 1,
				trainingApplicability: 2,
				total: 3
			},
			historicalReferences: {
				signInRosterFilters: 1,
				signInRosterSnapshots: 1,
				total: 2
			},
			canDelete: false
		});
	});

	it('blocks hard deletion when only historical rank references remain', async () => {
		const ctx = createTestContext();
		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'DET-SGT',
			label: 'Detachment Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'retired',
			sortOrder: 500
		});
		ctx.rawStore.seed('sign_in_rosters', [
			{
				id: 'sign-in-1',
				organization_id: 'test-org',
				filter_config: { ranks: ['DET-SGT'] },
				personnel_snapshot: []
			}
		]);

		const [summary] = await loadOrganizationRankCatalogReferenceSummaries(ctx, { codes: ['DET-SGT'] });
		await expect(removeOrganizationRankCatalogEntry(withAtomicDelete(ctx), { code: 'DET-SGT' })).rejects.toMatchObject({
			status: 409,
			message: 'Rank is referenced by Organization data. Retire it instead.'
		});

		expect(summary).toMatchObject({
			historicalReferences: { signInRosterFilters: 1, total: 1 },
			canDelete: false
		});
	});

	it('collapses whitespace when matching rank references', async () => {
		const ctx = createTestContext();
		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'Field Marshal',
			label: 'Field Marshal',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			sortOrder: 500
		});
		ctx.rawStore.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'Field   Marshal'
			}
		]);

		const [summary] = await loadOrganizationRankCatalogReferenceSummaries(ctx, { codes: ['Field Marshal'] });

		expect(summary).toMatchObject({
			activeReferences: { personnel: 1, total: 1 },
			canDelete: false
		});
	});

	it('requires Personnel roster-view access before loading rank reference summaries', async () => {
		const blockedCtx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: NO_CAPABILITIES
			}
		});

		await expect(loadOrganizationRankCatalogReferenceSummaries(blockedCtx, { codes: ['SGT'] })).rejects.toMatchObject({
			status: 403,
			message: 'You do not have permission to use personnel data'
		});
	});

	it('counts normalized references only when the catalog code is unambiguous', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'person-lower-custom',
				organization_id: 'test-org',
				rank: 'det-sgt'
			},
			{
				id: 'person-exact-army',
				organization_id: 'test-org',
				rank: 'GEN'
			},
			{
				id: 'person-ambiguous',
				organization_id: 'test-org',
				rank: 'gen'
			}
		]);

		const summaries = await loadOrganizationRankCatalogReferenceSummaries(ctx, {
			codes: ['DET-SGT', 'GEN', 'Gen']
		});
		const byCode = new Map(summaries.map((summary) => [summary.code, summary]));

		expect(byCode.get('DET-SGT')?.activeReferences.personnel).toBe(1);
		expect(byCode.get('GEN')?.activeReferences.personnel).toBe(1);
		expect(byCode.get('Gen')?.activeReferences.personnel).toBe(0);
	});

	it('does not assign a mixed-case reference to any of three ambiguous catalog codes', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [{ id: 'person-ambiguous', organization_id: 'test-org', rank: 'dEt' }]);

		const summaries = await loadOrganizationRankCatalogReferenceSummaries(ctx, {
			codes: ['DET', 'Det', 'det']
		});

		expect(summaries.map((summary) => summary.activeReferences.personnel)).toEqual([0, 0, 0]);
	});

	it('blocks hard deletion when active rank references exist but allows retiring the referenced rank', async () => {
		const ctx = createTestContext();
		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'DET-SGT',
			label: 'Detachment Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			sortOrder: 500
		});
		ctx.rawStore.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'DET-SGT',
				first_name: 'Jamie',
				last_name: 'Rivera'
			}
		]);

		await expect(removeOrganizationRankCatalogEntry(withAtomicDelete(ctx), { code: 'DET-SGT' })).rejects.toMatchObject({
			status: 409,
			message: 'Rank is referenced by active Organization data. Retire it instead.'
		});
		await retireOrganizationRankCatalogEntry(ctx, { code: 'DET-SGT' });

		await expect(loadOrganizationRankCatalog(ctx)).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'DET-SGT',
					state: 'retired'
				})
			])
		);
	});

	it('preserves the rank and emits no deletion audit when the atomic deletion guard rejects it', async () => {
		const ctx = createTestContext();
		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'DET-SGT',
			label: 'Detachment Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			sortOrder: 500
		});
		const before = await loadOrganizationRankCatalog(ctx);
		ctx.auditPort.events.length = 0;
		const guardedContext = {
			...ctx,
			rankCatalogAdministration: {
				async deleteRankCatalogEntry() {
					throw new Error('Rank is referenced by Organization data');
				}
			}
		};

		await expect(removeOrganizationRankCatalogEntry(guardedContext, { code: 'DET-SGT' })).rejects.toThrow(
			'Rank is referenced by Organization data'
		);
		await expect(loadOrganizationRankCatalog(ctx)).resolves.toEqual(before);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('removes unused custom ranks through the governed catalog delete path', async () => {
		const ctx = createTestContext();
		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'DET-SGT',
			label: 'Detachment Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			sortOrder: 500
		});
		ctx.auditPort.events.length = 0;

		const storedRank = await ctx.rawStore.findOne<{ id: string }>('organization_rank_catalog', 'test-org', {
			code: 'DET-SGT'
		});
		expect(storedRank?.id).toBeTruthy();
		await removeOrganizationRankCatalogEntry(withAtomicDelete(ctx), { code: 'DET-SGT' });

		await expect(loadOrganizationRankCatalog(ctx)).resolves.not.toEqual(
			expect.arrayContaining([expect.objectContaining({ code: 'DET-SGT' })])
		);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'organization.rank_catalog.deleted',
				resourceType: 'organization_rank_catalog',
				resourceId: storedRank?.id,
				details: {
					code: 'DET-SGT',
					label: 'Detachment Sergeant',
					source: 'custom',
					activeReferenceTotal: 0,
					historicalReferenceTotal: 0
				}
			}
		]);
	});

	it('does not block deleting an unused case-variant rank because another variant is referenced', async () => {
		const ctx = createTestContext();
		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'DET',
			label: 'Detachment',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			sortOrder: 500
		});
		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'det',
			label: 'Lowercase Detachment',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			sortOrder: 501
		});
		ctx.rawStore.seed('personnel', [
			{
				id: 'person-1',
				organization_id: 'test-org',
				rank: 'DET',
				first_name: 'Jamie',
				last_name: 'Rivera'
			}
		]);

		await removeOrganizationRankCatalogEntry(withAtomicDelete(ctx), { code: 'det' });

		await expect(loadOrganizationRankCatalog(ctx)).resolves.toEqual(
			expect.arrayContaining([expect.objectContaining({ code: 'DET' })])
		);
		await expect(loadOrganizationRankCatalog(ctx)).resolves.not.toEqual(
			expect.arrayContaining([expect.objectContaining({ code: 'det' })])
		);
	});

	it('denies service-pack add and hard-delete writes to Personnel-only editors', async () => {
		const personnelEditorCtx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: { ...NO_CAPABILITIES, personnel: 'configure' }
			}
		});

		await expect(addOrganizationRankServicePack(personnelEditorCtx, { service: 'navy' })).rejects.toMatchObject({
			status: 403,
			message: 'This action requires an organization admin or owner role'
		});
		await expect(
			removeOrganizationRankCatalogEntry(withAtomicDelete(personnelEditorCtx), { code: 'DET-SGT' })
		).rejects.toMatchObject({
			status: 403,
			message: 'This action requires an organization admin or owner role'
		});
	});

	it('rejects service-pack values that are not offered as built-in service packs', async () => {
		const ctx = createTestContext();

		await expect(addOrganizationRankServicePack(ctx, { service: 'civilian' })).rejects.toMatchObject({
			status: 400,
			message: 'Invalid rank service pack'
		});
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('canonicalizes unambiguous built-in rank aliases on save and preserves existing source', async () => {
		const ctx = createTestContext();
		await ensureOrganizationRankCatalog(ctx);
		ctx.auditPort.events.length = 0;
		const canonicalSergeant = BUILT_IN_RANK_CATALOG.find((entry) => entry.code === 'SGT');

		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'sgt',
			label: 'Sergeant Updated',
			service: 'army',
			category: 'enlisted',
			payGrade: 'E-5',
			state: 'active',
			sortOrder: 5
		});

		await expect(loadOrganizationRankCatalog(ctx)).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'SGT',
					label: canonicalSergeant?.label,
					service: canonicalSergeant?.service,
					category: canonicalSergeant?.category,
					payGrade: canonicalSergeant?.payGrade,
					state: 'active',
					source: 'built-in',
					sortOrder: canonicalSergeant?.sortOrder
				})
			])
		);
		await expect(loadOrganizationRankCatalog(ctx)).resolves.not.toEqual(
			expect.arrayContaining([expect.objectContaining({ code: 'sgt' })])
		);
		const storedRank = await ctx.rawStore.findOne<{ id: string }>('organization_rank_catalog', 'test-org', {
			code: 'SGT'
		});
		expect(storedRank?.id).toBeTruthy();
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'organization.rank_catalog.saved',
				resourceType: 'organization_rank_catalog',
				resourceId: storedRank?.id,
				details: {
					code: 'SGT',
					label: canonicalSergeant?.label,
					payGrade: canonicalSergeant?.payGrade,
					state: 'active',
					source: 'built-in'
				}
			}
		]);
	});

	it('saves built-in rank codes with canonical built-in metadata instead of caller metadata', async () => {
		const ctx = createTestContext();
		const canonicalSergeant = BUILT_IN_RANK_CATALOG.find((entry) => entry.code === 'SGT');

		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'sgt',
			label: 'Custom Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'retired',
			sortOrder: 999
		});

		await expect(loadOrganizationRankCatalog(ctx)).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'SGT',
					label: canonicalSergeant?.label,
					service: canonicalSergeant?.service,
					category: canonicalSergeant?.category,
					payGrade: canonicalSergeant?.payGrade,
					state: canonicalSergeant?.state,
					source: 'built-in',
					sortOrder: canonicalSergeant?.sortOrder
				})
			])
		);
	});

	it('lets Organization governors update and retire catalog entries through the use case', async () => {
		const ctx = createTestContext();

		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'DET-SGT',
			label: 'Detachment Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			sortOrder: 500
		});
		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'DET-SGT',
			label: 'Senior Detachment Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			sortOrder: 501
		});
		await retireOrganizationRankCatalogEntry(ctx, { code: 'DET-SGT' });

		await expect(loadOrganizationRankCatalog(ctx)).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'DET-SGT',
					label: 'Senior Detachment Sergeant',
					state: 'retired',
					source: 'custom',
					sortOrder: 501
				})
			])
		);
	});

	it('audits successful rank catalog retire operations after the entry is persisted', async () => {
		const ctx = createTestContext();

		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'DET-SGT',
			label: 'Detachment Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			sortOrder: 500
		});
		ctx.auditPort.events.length = 0;

		await retireOrganizationRankCatalogEntry(ctx, { code: 'DET-SGT' });

		await expect(loadOrganizationRankCatalog(ctx)).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'DET-SGT',
					label: 'Detachment Sergeant',
					state: 'retired',
					source: 'custom'
				})
			])
		);
		const storedRank = await ctx.rawStore.findOne<{ id: string }>('organization_rank_catalog', 'test-org', {
			code: 'DET-SGT'
		});
		expect(storedRank?.id).toBeTruthy();
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'organization.rank_catalog.retired',
				resourceType: 'organization_rank_catalog',
				resourceId: storedRank?.id,
				details: {
					code: 'DET-SGT',
					label: 'Detachment Sergeant',
					payGrade: 'ungraded',
					state: 'retired',
					source: 'custom'
				}
			}
		]);
	});

	it('reactivates retired built-in ranks through the governed catalog path', async () => {
		const ctx = createTestContext();
		await ensureOrganizationRankCatalog(ctx);
		await retireOrganizationRankCatalogEntry(ctx, { code: 'SGT' });
		ctx.auditPort.events.length = 0;

		await reactivateOrganizationRankCatalogEntry(ctx, { code: 'SGT' });

		await expect(loadOrganizationRankCatalog(ctx)).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'SGT',
					state: 'active',
					source: 'built-in'
				})
			])
		);
		const storedRank = await ctx.rawStore.findOne<{ id: string }>('organization_rank_catalog', 'test-org', {
			code: 'SGT'
		});
		expect(storedRank?.id).toBeTruthy();
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'organization.rank_catalog.reactivated',
				resourceType: 'organization_rank_catalog',
				resourceId: storedRank?.id,
				details: {
					code: 'SGT',
					label: 'Sergeant',
					payGrade: 'E-5',
					state: 'active',
					source: 'built-in'
				}
			}
		]);
	});
});
