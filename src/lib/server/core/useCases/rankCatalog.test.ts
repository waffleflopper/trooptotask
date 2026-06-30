import { describe, expect, it } from 'vitest';
import { BUILT_IN_RANK_CATALOG } from '$lib/domain/rankCatalog';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	ensureOrganizationRankCatalog,
	loadOrganizationRankCatalog,
	retireOrganizationRankCatalogEntry,
	saveOrganizationRankCatalogEntry
} from './rankCatalog';

const NO_CAPABILITIES = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
} as const;

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

		expect(catalog).toHaveLength(BUILT_IN_RANK_CATALOG.length);
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

		expect(catalog).toHaveLength(BUILT_IN_RANK_CATALOG.length);
		expect(catalog).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: overlongRank })]));
		expect(catalog).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'X'.repeat(80) })]));
	});

	it('does not discover lower-case variants of built-in rank codes', async () => {
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
				rank: 'gen',
				first_name: 'Casey',
				last_name: 'Lee'
			}
		]);

		const catalog = await ensureOrganizationRankCatalog(ctx);

		expect(catalog).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CAPT' })]));
		expect(catalog).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'Capt' })]));
		expect(catalog).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'capt' })]));
		expect(catalog).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'gen' })]));
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
					defaultCount: BUILT_IN_RANK_CATALOG.length,
					discoveredCount: 0
				}
			}
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
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'organization.rank_catalog.saved',
				resourceType: 'organization_rank_catalog',
				resourceId: 'DET-SGT',
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

	it('canonicalizes unambiguous built-in rank aliases on save and preserves existing source', async () => {
		const ctx = createTestContext();
		await ensureOrganizationRankCatalog(ctx);
		ctx.auditPort.events.length = 0;

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
					label: 'Sergeant Updated',
					source: 'built-in'
				})
			])
		);
		await expect(loadOrganizationRankCatalog(ctx)).resolves.not.toEqual(
			expect.arrayContaining([expect.objectContaining({ code: 'sgt' })])
		);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'organization.rank_catalog.saved',
				resourceType: 'organization_rank_catalog',
				resourceId: 'SGT',
				details: {
					code: 'SGT',
					label: 'Sergeant Updated',
					payGrade: 'E-5',
					state: 'active',
					source: 'built-in'
				}
			}
		]);
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
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'organization.rank_catalog.retired',
				resourceType: 'organization_rank_catalog',
				resourceId: 'DET-SGT',
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
});
