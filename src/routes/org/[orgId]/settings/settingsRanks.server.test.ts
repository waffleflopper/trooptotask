import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { saveOrganizationRankCatalogEntry } from '$lib/server/core/useCases/rankCatalog';
import { buildRanksSettingsData, loadRanksSettings } from './settingsRanks.server';

const NO_CAPABILITIES = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
} as const;

describe('rank settings read model', () => {
	it('groups active and retired rank catalog rows with service-pack options and reference warnings', async () => {
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
			code: 'OLD-SGT',
			label: 'Old Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'retired',
			sortOrder: 501
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
			}
		]);
		ctx.rawStore.seed('sign_in_rosters', [
			{
				id: 'sign-in-1',
				organization_id: 'test-org',
				filter_config: { ranks: ['DET-SGT'] },
				personnel_snapshot: [{ id: 'person-1', rank: 'DET-SGT' }]
			}
		]);

		const settings = await loadRanksSettings(ctx);
		const activeRank = settings.sections.ranks.entries.active.find((entry) => entry.code === 'DET-SGT');
		const retiredRank = settings.sections.ranks.entries.retired.find((entry) => entry.code === 'OLD-SGT');
		const navyPack = settings.sections.ranks.servicePacks.find((pack) => pack.value === 'navy');

		expect(settings.sections.ranks.commands.canManageCatalog).toBe(true);
		expect(settings.sections.ranks.copy).toEqual({
			payGradeHelp: 'Pay grade groups ranks for cross-service ordering without changing Personnel rank strings.',
			tieBreakHelp: 'Tie-break order only decides display order when ranks share the same pay grade.'
		});
		expect(navyPack).toMatchObject({
			label: 'Navy',
			missingCount: expect.any(Number),
			isInstalled: false
		});
		expect(activeRank).toMatchObject({
			code: 'DET-SGT',
			state: 'active',
			source: 'custom',
			referenceSummary: {
				activeReferences: {
					personnel: 1,
					trainingApplicability: 1,
					total: 2
				},
				historicalReferences: {
					signInRosterFilters: 1,
					signInRosterSnapshots: 1,
					total: 2
				},
				canDelete: false
			},
			commands: {
				canEdit: true,
				canRetire: true,
				canDelete: false,
				deleteDisabledReason: 'Referenced by active Organization data; retire it instead.'
			}
		});
		expect(activeRank?.warnings).toEqual([
			'Referenced by 2 active records or filters. Retire this rank to preserve existing records.',
			'Also appears in 2 historical snapshots or saved filters.'
		]);
		expect(retiredRank).toMatchObject({
			code: 'OLD-SGT',
			state: 'retired',
			commands: {
				canEdit: true,
				canRetire: false,
				canDelete: true,
				deleteDisabledReason: null
			}
		});
	});

	it('only offers hard delete for unused custom or discovered ranks and suppresses writes for non-governors', () => {
		const settings = buildRanksSettingsData({
			canManageCatalog: false,
			catalog: [
				{
					organizationId: 'test-org',
					code: 'SGT',
					label: 'Sergeant',
					service: 'army',
					category: 'enlisted',
					payGrade: 'E-5',
					state: 'active',
					source: 'built-in',
					sortOrder: 5
				},
				{
					organizationId: 'test-org',
					code: 'DET-SGT',
					label: 'Detachment Sergeant',
					service: 'custom',
					category: 'custom',
					payGrade: 'ungraded',
					state: 'active',
					source: 'custom',
					sortOrder: 500
				}
			],
			referenceSummaries: [
				{
					code: 'SGT',
					activeReferences: {
						personnel: 0,
						trainingApplicability: 0,
						dutyRosterTemplateFilters: 0,
						legacyDutyTemplateSlots: 0,
						total: 0
					},
					historicalReferences: {
						signInRosterFilters: 0,
						signInRosterSnapshots: 0,
						acceptedDutyRosterSnapshots: 0,
						total: 0
					},
					canDelete: true
				},
				{
					code: 'DET-SGT',
					activeReferences: {
						personnel: 0,
						trainingApplicability: 0,
						dutyRosterTemplateFilters: 0,
						legacyDutyTemplateSlots: 0,
						total: 0
					},
					historicalReferences: {
						signInRosterFilters: 0,
						signInRosterSnapshots: 0,
						acceptedDutyRosterSnapshots: 0,
						total: 0
					},
					canDelete: true
				}
			]
		});

		expect(settings.sections.ranks.commands.canManageCatalog).toBe(false);
		expect(settings.sections.ranks.entries.active).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'SGT',
					commands: {
						canEdit: false,
						canRetire: false,
						canDelete: false,
						deleteDisabledReason: 'Built-in ranks can be retired but not removed.'
					}
				}),
				expect.objectContaining({
					code: 'DET-SGT',
					commands: {
						canEdit: false,
						canRetire: false,
						canDelete: false,
						deleteDisabledReason: null
					}
				})
			])
		);
	});

	it('marks Organization admins and owners as catalog managers without relying on Personnel edit permission', async () => {
		const memberCtx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: { ...NO_CAPABILITIES, personnel: 'configure' }
			}
		});
		const ownerCtx = createTestContext();

		expect(
			buildRanksSettingsData({ catalog: [], referenceSummaries: [], canManageCatalog: false }).sections.ranks.commands
		).toEqual({
			canManageCatalog: false,
			canAddServicePack: false,
			canAddCustomRank: false
		});
		await expect(loadRanksSettings(ownerCtx)).resolves.toMatchObject({
			sections: {
				ranks: {
					commands: {
						canManageCatalog: true,
						canAddServicePack: true,
						canAddCustomRank: true
					}
				}
			}
		});
		expect(memberCtx.auth.canManageMembers).toBe(false);
	});
});
