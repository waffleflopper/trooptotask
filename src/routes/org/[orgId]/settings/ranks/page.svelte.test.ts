// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

vi.mock('$app/forms', () => ({
	enhance: () => {}
}));

afterEach(() => {
	cleanup();
});

describe('rank settings page', () => {
	it('renders the rank catalog management surface with service packs, help text, warnings, and errors', () => {
		render(Page, {
			props: {
				data: {
					ranksSettings: {
						sections: {
							ranks: {
								commands: {
									canManageCatalog: true,
									canAddServicePack: true,
									canAddCustomRank: true
								},
								copy: {
									payGradeHelp:
										'Pay grade groups ranks for cross-service ordering without changing Personnel rank strings.',
									tieBreakHelp: 'Tie-break order only decides display order when ranks share the same pay grade.'
								},
								servicePacks: [
									{
										value: 'navy',
										label: 'Navy',
										builtInCount: 25,
										existingCount: 0,
										missingCount: 25,
										isInstalled: false
									}
								],
								options: {
									services: [{ value: 'custom', label: 'Custom' }],
									categories: [{ value: 'custom', label: 'Custom' }],
									payGrades: [{ value: 'ungraded', label: 'Ungraded' }],
									states: [
										{ value: 'active', label: 'Active' },
										{ value: 'retired', label: 'Retired' }
									]
								},
								entries: {
									active: [
										{
											code: 'DET-SGT',
											label: 'Detachment Sergeant',
											service: 'custom',
											serviceLabel: 'Custom',
											category: 'custom',
											categoryLabel: 'Custom',
											payGrade: 'ungraded',
											payGradeLabel: 'Ungraded',
											state: 'active',
											source: 'custom',
											sourceLabel: 'Custom',
											sortOrder: 500,
											referenceSummary: {
												code: 'DET-SGT',
												activeReferences: {
													personnel: 1,
													trainingApplicability: 1,
													dutyRosterTemplateFilters: 0,
													legacyDutyTemplateSlots: 0,
													total: 2
												},
												historicalReferences: {
													signInRosterFilters: 1,
													signInRosterSnapshots: 1,
													acceptedDutyRosterSnapshots: 0,
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
												canRetire: true,
												canDelete: false,
												deleteDisabledReason: 'Referenced by active Organization data; retire it instead.'
											}
										}
									],
									retired: [
										{
											code: 'OLD-SGT',
											label: 'Old Sergeant',
											service: 'custom',
											serviceLabel: 'Custom',
											category: 'custom',
											categoryLabel: 'Custom',
											payGrade: 'ungraded',
											payGradeLabel: 'Ungraded',
											state: 'retired',
											source: 'custom',
											sourceLabel: 'Custom',
											sortOrder: 501,
											referenceSummary: {
												code: 'OLD-SGT',
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
											warnings: [],
											commands: {
												canEdit: true,
												canRetire: false,
												canDelete: true,
												deleteDisabledReason: null
											}
										}
									]
								}
							}
						}
					}
				} as never,
				form: { rankError: 'Denied write' },
				params: { orgId: 'org-1' }
			}
		});

		expect(screen.getByRole('heading', { name: 'Rank Catalog' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Add Navy' })).toBeTruthy();
		expect(screen.getByText(/Pay grade groups ranks/)).toBeTruthy();
		expect(screen.getByText(/Tie-break order only decides display order/)).toBeTruthy();
		expect(screen.getByText('Denied write')).toBeTruthy();
		expect(
			screen.getByText('Referenced by 2 active records or filters. Retire this rank to preserve existing records.')
		).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Remove DET-SGT' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Remove OLD-SGT' })).toBeTruthy();
	});

	it('renders built-in ranks with spaced codes using safe ids and no metadata edit form', () => {
		render(Page, {
			props: {
				data: {
					ranksSettings: {
						sections: {
							ranks: {
								commands: {
									canManageCatalog: true,
									canAddServicePack: true,
									canAddCustomRank: true
								},
								copy: {
									payGradeHelp:
										'Pay grade groups ranks for cross-service ordering without changing Personnel rank strings.',
									tieBreakHelp: 'Tie-break order only decides display order when ranks share the same pay grade.'
								},
								servicePacks: [],
								options: {
									services: [{ value: 'air-force', label: 'Air Force' }],
									categories: [{ value: 'officer', label: 'Officer' }],
									payGrades: [{ value: 'O-9', label: 'O-9' }],
									states: [
										{ value: 'active', label: 'Active' },
										{ value: 'retired', label: 'Retired' }
									]
								},
								entries: {
									active: [
										{
											code: 'Lt Gen',
											label: 'Lieutenant General',
											service: 'air-force',
											serviceLabel: 'Air Force',
											category: 'officer',
											categoryLabel: 'Officer',
											payGrade: 'O-9',
											payGradeLabel: 'O-9',
											state: 'active',
											source: 'built-in',
											sourceLabel: 'Built-in',
											sortOrder: 0,
											referenceSummary: {
												code: 'Lt Gen',
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
											warnings: [],
											commands: {
												canEdit: false,
												canRetire: true,
												canDelete: false,
												deleteDisabledReason: 'Built-in ranks can be retired but not removed.'
											}
										}
									],
									retired: []
								}
							}
						}
					}
				} as never,
				form: null,
				params: { orgId: 'org-1' }
			}
		});

		const heading = screen.getByRole('heading', { name: 'Lt Gen · Lieutenant General' });
		const card = heading.closest('article');

		expect(card?.getAttribute('aria-labelledby')).toBe(heading.id);
		expect(heading.id).not.toContain(' ');
		expect(screen.getByRole('button', { name: 'Retire Lt Gen' })).toBeTruthy();
		expect(screen.queryByText('Edit rank')).toBeNull();
	});
});
