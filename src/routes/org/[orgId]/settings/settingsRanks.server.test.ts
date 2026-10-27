import { describe, expect, it } from 'vitest';
import { BUILT_IN_RANK_CATALOG } from '$features/personnel/contracts';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import { saveOrganizationRankCatalogEntry, setOrganizationRankCatalogStates } from '$features/personnel/index.server';
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
	it('groups active and retired rank catalog rows with service-pack options', async () => {
		const ctx = createTestContext();
		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'DET-SGT',
			label: 'Detachment Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			sortOrder: 500
		});
		await saveOrganizationRankCatalogEntry(ctx, {
			code: 'OLD-SGT',
			label: 'Old Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			sortOrder: 501
		});
		await setOrganizationRankCatalogStates(ctx, { changes: [{ code: 'OLD-SGT', state: 'retired' }] });
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

		const settings = await loadRanksSettings({
			...ctx,
			readSignInRosterRankReferences: async () => [{ filterRanks: ['DET-SGT'], snapshotRanks: ['DET-SGT'] }]
		});
		const activeRank = settings.sections.ranks.entries.active.find((entry) => entry.code === 'DET-SGT');
		const retiredRank = settings.sections.ranks.entries.retired.find((entry) => entry.code === 'OLD-SGT');
		const navyPack = settings.sections.ranks.servicePacks.find((pack) => pack.value === 'navy');

		expect(settings.sections.ranks.commands.canManageCatalog).toBe(true);
		expect(settings.sections.ranks.copy).toEqual({
			payGradeHelp: 'Pay grade groups ranks for cross-service ordering without changing Personnel rank strings.',
			tieBreakHelp: 'Tie-break order only decides display order when ranks share the same pay grade.'
		});
		expect(navyPack).toMatchObject({
			label: 'Navy'
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
			warnings: [
				'Referenced by 2 active records or filters. Retire this rank to preserve existing records.',
				'Also appears in 2 historical snapshots or saved filters.'
			],
			commands: {
				canEdit: true,
				canDelete: false,
				deleteDisabledReason: 'Referenced by active Organization data; retire it instead.'
			}
		});
		expect(retiredRank).toMatchObject({
			code: 'OLD-SGT',
			state: 'retired',
			commands: {
				canEdit: true,
				canDelete: true,
				deleteDisabledReason: null
			}
		});
	});

	it('loads Training rank references for Organization admins without Personnel or Training lane access', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
				canManageMembers: true,
				capabilityMap: NO_CAPABILITIES
			}
		});
		ctx.rawStore.seed('organization_rank_catalog', [
			{
				id: 'rank-det-sgt',
				organization_id: 'test-org',
				code: 'DET-SGT',
				label: 'Detachment Sergeant',
				service: 'custom',
				category: 'custom',
				pay_grade: 'ungraded',
				state: 'active',
				source: 'custom',
				sort_order: 500
			}
		]);
		ctx.rawStore.seed('training_types', [
			{
				id: 'training-1',
				organization_id: ctx.auth.orgId,
				name: 'Annual Check',
				applies_to_ranks: ['DET-SGT'],
				excluded_ranks: []
			}
		]);

		const settings = await loadRanksSettings({ ...ctx, readSignInRosterRankReferences: async () => [] });

		expect(settings.sections.ranks.commands.canManageCatalog).toBe(true);
		expect(settings.sections.ranks.entries.active).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'DET-SGT',
					referenceSummary: expect.objectContaining({
						activeReferences: { personnel: 0, trainingApplicability: 1, total: 1 }
					})
				})
			])
		);
	});

	it('keeps service packs installable when matching rows are discovered instead of built-in', () => {
		const navyDiscoveredRows = BUILT_IN_RANK_CATALOG.filter((entry) => entry.service === 'navy').map((entry) => ({
			organizationId: 'test-org',
			code: entry.code,
			label: entry.label,
			service: 'custom' as const,
			category: 'custom' as const,
			payGrade: 'ungraded' as const,
			state: 'active' as const,
			source: 'discovered' as const,
			sortOrder: 500
		}));

		const settings = buildRanksSettingsData({
			canManageCatalog: true,
			catalog: navyDiscoveredRows,
			referenceSummaries: navyDiscoveredRows.map((entry) => ({
				code: entry.code,
				activeReferences: {
					personnel: 0,
					trainingApplicability: 0,
					total: 0
				},
				historicalReferences: {
					signInRosterFilters: 0,
					signInRosterSnapshots: 0,
					total: 0
				},
				canDelete: true
			}))
		});

		expect(settings.sections.ranks.servicePacks.find((pack) => pack.value === 'navy')).toMatchObject({
			existingCount: 0
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
				},
				{
					organizationId: 'test-org',
					code: 'DISC-SGT',
					label: 'Discovered Sergeant',
					service: 'custom',
					category: 'custom',
					payGrade: 'ungraded',
					state: 'active',
					source: 'discovered',
					sortOrder: 501
				}
			],
			referenceSummaries: [
				{
					code: 'SGT',
					activeReferences: {
						personnel: 0,
						trainingApplicability: 0,
						total: 0
					},
					historicalReferences: {
						signInRosterFilters: 0,
						signInRosterSnapshots: 0,
						total: 0
					},
					canDelete: true
				},
				{
					code: 'DET-SGT',
					activeReferences: {
						personnel: 0,
						trainingApplicability: 0,
						total: 0
					},
					historicalReferences: {
						signInRosterFilters: 0,
						signInRosterSnapshots: 0,
						total: 0
					},
					canDelete: true
				},
				{
					code: 'DISC-SGT',
					activeReferences: {
						personnel: 0,
						trainingApplicability: 0,
						total: 0
					},
					historicalReferences: {
						signInRosterFilters: 0,
						signInRosterSnapshots: 0,
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
						canDelete: false,
						deleteDisabledReason: 'Built-in ranks can be retired but not removed.'
					}
				}),
				expect.objectContaining({
					code: 'DET-SGT',
					commands: {
						canEdit: false,
						canDelete: false,
						deleteDisabledReason: null
					}
				}),
				expect.objectContaining({
					code: 'DISC-SGT',
					source: 'discovered',
					commands: {
						canEdit: false,
						canDelete: false,
						deleteDisabledReason: null
					}
				})
			])
		);
	});

	it('disables hard delete when only historical references remain', () => {
		const settings = buildRanksSettingsData({
			canManageCatalog: true,
			catalog: [
				{
					organizationId: 'test-org',
					code: 'DET-SGT',
					label: 'Detachment Sergeant',
					service: 'custom',
					category: 'custom',
					payGrade: 'ungraded',
					state: 'retired',
					source: 'custom',
					sortOrder: 500
				}
			],
			referenceSummaries: [
				{
					code: 'DET-SGT',
					activeReferences: {
						personnel: 0,
						trainingApplicability: 0,
						total: 0
					},
					historicalReferences: {
						signInRosterFilters: 1,
						signInRosterSnapshots: 0,
						total: 1
					},
					canDelete: false
				}
			]
		});

		expect(settings.sections.ranks.entries.retired).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'DET-SGT',
					warnings: ['Also appears in 1 historical snapshot or saved filter.'],
					commands: expect.objectContaining({
						canDelete: false,
						deleteDisabledReason: 'Referenced by historical snapshots or saved filters; retire it instead.'
					})
				})
			])
		);
	});

	it('uses historical-only delete blocker copy when reference summaries cannot allow deletion', () => {
		const settings = buildRanksSettingsData({
			canManageCatalog: true,
			catalog: [
				{
					organizationId: 'test-org',
					code: 'ARCHIVE-SGT',
					label: 'Archive Sergeant',
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
					code: 'ARCHIVE-SGT',
					activeReferences: {
						personnel: 0,
						trainingApplicability: 0,
						total: 0
					},
					historicalReferences: {
						signInRosterFilters: 1,
						signInRosterSnapshots: 1,
						total: 2
					},
					canDelete: false
				}
			]
		});

		expect(settings.sections.ranks.entries.active[0]?.commands).toMatchObject({
			canDelete: false,
			deleteDisabledReason: 'Referenced by historical snapshots or saved filters; retire it instead.'
		});
	});

	it('keeps built-in rank metadata read only', () => {
		const settings = buildRanksSettingsData({
			canManageCatalog: true,
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
					sortOrder: 0
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
						total: 0
					},
					historicalReferences: {
						signInRosterFilters: 0,
						signInRosterSnapshots: 0,
						total: 0
					},
					canDelete: true
				},
				{
					code: 'DET-SGT',
					activeReferences: {
						personnel: 0,
						trainingApplicability: 0,
						total: 0
					},
					historicalReferences: {
						signInRosterFilters: 0,
						signInRosterSnapshots: 0,
						total: 0
					},
					canDelete: true
				}
			]
		});

		expect(settings.sections.ranks.entries.active).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'SGT',
					commands: {
						canEdit: false,
						canDelete: false,
						deleteDisabledReason: 'Built-in ranks can be retired but not removed.'
					}
				}),
				expect.objectContaining({
					code: 'DET-SGT',
					commands: expect.objectContaining({
						canEdit: true,
						canDelete: true
					})
				})
			])
		);
	});

	it('fails closed when a custom rank is missing its reference summary', () => {
		const settings = buildRanksSettingsData({
			canManageCatalog: true,
			catalog: [
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
			referenceSummaries: []
		});

		expect(settings.sections.ranks.entries.active).toEqual([
			expect.objectContaining({
				code: 'DET-SGT',
				referenceSummary: expect.objectContaining({
					canDelete: false,
					activeReferences: expect.objectContaining({ total: 0 }),
					historicalReferences: expect.objectContaining({ total: 0 })
				}),
				commands: {
					canEdit: true,
					canDelete: false,
					deleteDisabledReason: 'Reference check unavailable; retire it instead.'
				}
			})
		]);
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
		const adminCtx = createTestContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
				canManageMembers: true
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
		await expect(
			loadRanksSettings({ ...ownerCtx, readSignInRosterRankReferences: async () => [] })
		).resolves.toMatchObject({
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
		await expect(
			loadRanksSettings({ ...adminCtx, readSignInRosterRankReferences: async () => [] })
		).resolves.toMatchObject({
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
		await expect(
			loadRanksSettings({ ...memberCtx, readSignInRosterRankReferences: async () => [] })
		).rejects.toMatchObject({
			status: 403,
			message: 'This action requires an organization admin or owner role'
		});
	});
	it('lists a rank missing from an added branch pack as off, and no ranks from a pack never added', () => {
		const armyWithoutSergeant = BUILT_IN_RANK_CATALOG.filter(
			(entry) => entry.service === 'army' && entry.code !== 'SGT'
		).map((entry) => ({ ...entry, organizationId: 'test-org', source: 'built-in' as const }));

		const ranks = buildRanksSettingsData({
			catalog: armyWithoutSergeant,
			referenceSummaries: [],
			canManageCatalog: true
		}).sections.ranks;

		expect(ranks.entries.retired.find((entry) => entry.code === 'SGT')).toMatchObject({
			service: 'army',
			state: 'retired',
			source: 'built-in'
		});
		expect([...ranks.entries.active, ...ranks.entries.retired].some((entry) => entry.service === 'navy')).toBe(false);
	});
});
