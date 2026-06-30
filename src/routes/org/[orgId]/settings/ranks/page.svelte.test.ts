// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

vi.mock('$app/forms', () => ({
	enhance: () => {}
}));

afterEach(() => {
	cleanup();
});

describe('rank settings page', () => {
	it('renders the rank catalog management surface with service packs, help text, warnings, and errors', async () => {
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
										existingCount: 2,
										activeCount: 2,
										retiredCount: 0,
										missingCount: 23,
										isInstalled: false,
										canBulkRetire: true,
										canBulkReactivate: false
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
												canReactivate: false,
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
												canReactivate: true,
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
		expect(screen.getByRole('heading', { name: 'Branch Coverage' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Add Navy' })).toBeTruthy();
		expect(screen.getAllByRole('columnheader', { name: 'Branch' }).length).toBeGreaterThan(0);
		expect(screen.getByText(/Pay grade groups ranks/)).toBeTruthy();
		expect(screen.getByText(/Tie-break order only decides display order/)).toBeTruthy();
		expect(screen.getByText('Denied write')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Add custom rank' })).toBeTruthy();
		expect(document.querySelector('input[name="intent"][value="add"]')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Add custom rank' }));
		expect(document.querySelector('input[name="intent"][value="add"]')).toBeTruthy();
		expect(screen.getByPlaceholderText('DET-SGT')).toBeTruthy();
		expect(screen.getByPlaceholderText('Detachment Sergeant')).toBeTruthy();
		expect(screen.getByText(/Only used when ranks share the same pay grade/)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Retire active Navy ranks' }));
		expect(screen.getByRole('heading', { name: 'Retire Navy ranks' })).toBeTruthy();
		expect(screen.getByText(/2 Navy built-in ranks will be hidden/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Retire active ranks' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await fireEvent.click(screen.getByRole('button', { name: /DET-SGT.*Detachment Sergeant/ }));
		expect(
			screen.getByText('Referenced by 2 active records or filters. Retire this rank to preserve existing records.')
		).toBeTruthy();
		expect(document.querySelector('input[name="intent"][value="edit"]')).toBeTruthy();
		expect(document.querySelector('input[name="originalCode"][value="DET-SGT"]')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Remove DET-SGT' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Reactivate OLD-SGT' })).toBeTruthy();
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
												canReactivate: false,
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

		expect(screen.getByRole('button', { name: /Lt Gen.*Lieutenant General/ })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Retire Lt Gen' })).toBeTruthy();
		expect(screen.queryByText('Edit rank')).toBeNull();
	});

	it('renders retired built-in ranks with reactivate but no remove action', async () => {
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
									services: [{ value: 'army', label: 'Army' }],
									categories: [{ value: 'enlisted', label: 'Enlisted' }],
									payGrades: [{ value: 'E-4', label: 'E-4' }],
									states: [
										{ value: 'active', label: 'Active' },
										{ value: 'retired', label: 'Retired' }
									]
								},
								entries: {
									active: [],
									retired: [
										{
											code: 'SP4',
											label: 'Specialist Four',
											service: 'army',
											serviceLabel: 'Army',
											category: 'enlisted',
											categoryLabel: 'Enlisted',
											payGrade: 'E-4',
											payGradeLabel: 'E-4',
											state: 'retired',
											source: 'built-in',
											sourceLabel: 'Built-in',
											sortOrder: 2,
											referenceSummary: {
												code: 'SP4',
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
												canRetire: false,
												canReactivate: true,
												canDelete: false,
												deleteDisabledReason: 'Built-in ranks can be retired but not removed.'
											}
										}
									]
								}
							}
						}
					}
				} as never,
				form: null,
				params: { orgId: 'org-1' }
			}
		});

		expect(screen.getByRole('button', { name: 'Reactivate SP4' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Remove SP4' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /SP4.*Specialist Four/ }));
		expect(screen.getByText('Built-in ranks can be retired but not removed.')).toBeTruthy();
	});
});
