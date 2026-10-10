// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RanksSettingsData, SettingsRankCatalogRow } from '../settingsSectionTypes';
import Page from './+page.svelte';

type HeldSubmission = (opts: { result: { type: 'success' | 'failure' }; update: () => Promise<void> }) => Promise<void>;
const { heldSubmissions, submittedForms } = vi.hoisted(() => ({
	heldSubmissions: [] as HeldSubmission[],
	submittedForms: [] as Array<{ action: string; fields: Record<string, string> }>
}));

// Holds each enhanced submission until the test settles it.
vi.mock('$app/forms', () => ({
	enhance: (
		form: HTMLFormElement,
		submit?: (input: { formElement: HTMLFormElement; formData: FormData }) => unknown
	) => {
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			submittedForms.push({
				action: form.getAttribute('action') ?? '',
				fields: Object.fromEntries(new FormData(form) as unknown as Iterable<[string, string]>)
			});
			heldSubmissions.push(submit?.({ formElement: form, formData: new FormData(form) }) as HeldSubmission);
		});
	}
}));

beforeEach(() => {
	vi.useFakeTimers();
});

async function cleanupRankPage() {
	cleanup();
	// Dialog/menu unmount schedules body-style restoration. Execute that work
	// while happy-dom still exists instead of leaving it to the worker teardown.
	await vi.runAllTimersAsync();
	expect(vi.getTimerCount()).toBe(0);
}

afterEach(async () => {
	heldSubmissions.length = 0;
	submittedForms.length = 0;
	try {
		await cleanupRankPage();
	} finally {
		vi.useRealTimers();
	}
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
													total: 0
												},
												historicalReferences: {
													signInRosterFilters: 0,
													signInRosterSnapshots: 0,
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
		expect(screen.getByText('Denied write')).toBeTruthy();

		// Custom rank form is collapsed until requested, and carries the co-located help text.
		expect(screen.queryByRole('heading', { name: 'Add Custom Rank' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Add custom rank' }));
		expect(screen.getByRole('heading', { name: 'Add Custom Rank' })).toBeTruthy();
		expect(screen.getByPlaceholderText('DET-SGT')).toBeTruthy();
		expect(screen.getByPlaceholderText('Detachment Sergeant')).toBeTruthy();
		expect(screen.getByText(/Pay grade groups ranks/)).toBeTruthy();
		expect(screen.getByText(/Tie-break order only decides display order/)).toBeTruthy();

		// Branch-pack bulk actions live in an overflow menu and confirm before applying.
		await fireEvent.click(screen.getByRole('button', { name: 'More actions for Navy' }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Retire active ranks (2)' }));
		expect(screen.getByRole('heading', { name: 'Retire Navy ranks' })).toBeTruthy();
		expect(screen.getByText(/2 Navy built-in ranks will be hidden/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Retire active ranks' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		// Show active and retired entries together in the single catalog table.
		await fireEvent.click(screen.getByRole('button', { name: 'All' }));

		// Expanding a rank reveals its references and inline edit form.
		await fireEvent.click(screen.getByRole('button', { name: 'Show details for DET-SGT' }));
		expect(
			screen.getByText('Referenced by 2 active records or filters. Retire this rank to preserve existing records.')
		).toBeTruthy();
		expect(screen.getByText('Edit rank')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Save DET-SGT' })).toBeTruthy();

		// Referenced custom rank can be retired but not removed; unreferenced retired rank can be reactivated or removed.
		await fireEvent.click(screen.getByRole('button', { name: 'Actions for DET-SGT' }));
		expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeTruthy();
		expect(screen.getByRole('menuitem', { name: 'Retire' })).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Remove' })).toBeNull();

		// Those actions are reachable from the retired rank's overflow menu.
		await fireEvent.click(screen.getByRole('button', { name: 'Actions for OLD-SGT' }));
		expect(screen.getByRole('menuitem', { name: 'Reactivate' })).toBeTruthy();
		expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeTruthy();
	});

	it('renders built-in ranks with spaced codes using safe ids and no metadata edit form', async () => {
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
													total: 0
												},
												historicalReferences: {
													signInRosterFilters: 0,
													signInRosterSnapshots: 0,
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

		expect(screen.getByRole('button', { name: 'Show details for Lt Gen' })).toBeTruthy();
		// Built-in active rank can be retired but not edited or removed.
		await fireEvent.click(screen.getByRole('button', { name: 'Actions for Lt Gen' }));
		expect(screen.getByRole('menuitem', { name: 'Retire' })).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull();
		expect(screen.queryByRole('menuitem', { name: 'Remove' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Show details for Lt Gen' }));
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
													total: 0
												},
												historicalReferences: {
													signInRosterFilters: 0,
													signInRosterSnapshots: 0,
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

		// Retired entries are shown via the state filter.
		await fireEvent.click(screen.getByRole('button', { name: 'Retired' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Actions for SP4' }));
		expect(screen.getByRole('menuitem', { name: 'Reactivate' })).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Remove' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Show details for SP4' }));
		expect(screen.getByText('Built-in ranks can be retired but not removed.')).toBeTruthy();
	});
});

describe('rank confirmation lifecycle', () => {
	const ranksSettings: RanksSettingsData = {
		sections: {
			ranks: {
				commands: { canManageCatalog: true, canAddServicePack: true, canAddCustomRank: true },
				copy: { payGradeHelp: 'Pay grade help', tieBreakHelp: 'Tie-break help' },
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
				options: { services: [], categories: [], payGrades: [], states: [] },
				entries: { active: [], retired: [] }
			}
		}
	};

	it.each(['cancel', 'unmount'] as const)(
		'finishes %s cleanup before the test document is released',
		async (action) => {
			const originalStyle = document.body.getAttribute('style');
			render(Page, { data: { ranksSettings } as never, form: null, params: { orgId: 'org-1' } });
			await fireEvent.click(screen.getByRole('button', { name: 'More actions for Navy' }));
			await fireEvent.click(screen.getByRole('menuitem', { name: 'Retire active ranks (2)' }));
			await vi.runAllTimersAsync();
			expect(screen.getByRole('alertdialog', { name: 'Retire Navy ranks' })).toBeTruthy();
			expect(document.body.style.overflow).toBe('hidden');
			expect(document.body.style.pointerEvents).toBe('none');
			if (action === 'cancel') {
				await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
				expect(screen.queryByRole('alertdialog')).toBeNull();
			}

			await cleanupRankPage();
			expect(document.body.getAttribute('style') ?? '').toBe(originalStyle ?? '');
			// Model Vitest releasing happy-dom immediately after this suite's cleanup.
			const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')!;
			try {
				Reflect.deleteProperty(globalThis, 'document');
				await vi.runAllTimersAsync();
			} finally {
				Object.defineProperty(globalThis, 'document', documentDescriptor);
			}
			expect(document.body.getAttribute('style') ?? '').toBe(originalStyle ?? '');
			expect(vi.getTimerCount()).toBe(0);
		}
	);
	it('disables rank mutations while a submitted rank action is pending', async () => {
		const entry = {
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
				activeReferences: { personnel: 0, trainingApplicability: 0, total: 0 },
				historicalReferences: { signInRosterFilters: 0, signInRosterSnapshots: 0, total: 0 },
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
		};
		render(Page, {
			props: {
				data: {
					ranksSettings: {
						sections: {
							ranks: {
								commands: { canManageCatalog: true, canAddServicePack: true, canAddCustomRank: true },
								copy: { payGradeHelp: 'Pay grade help.', tieBreakHelp: 'Tie-break help.' },
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
								entries: { active: [entry], retired: [] }
							}
						}
					}
				} as never,
				form: null,
				params: { orgId: 'org-1' }
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Actions for Lt Gen' }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Retire' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Retire rank' }));
		expect(heldSubmissions).toHaveLength(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Actions for Lt Gen' }));
		expect(screen.getByRole('menuitem', { name: 'Retire' }).getAttribute('aria-disabled')).toBe('true');

		await heldSubmissions[0]({ result: { type: 'success' }, update: async () => {} });
		await vi.runAllTimersAsync();
		expect(screen.getByRole('menuitem', { name: 'Retire' }).getAttribute('aria-disabled')).not.toBe('true');
	});
});

function rankEntry(overrides: Partial<SettingsRankCatalogRow> = {}): SettingsRankCatalogRow {
	return {
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
			activeReferences: { personnel: 0, trainingApplicability: 0, total: 0 },
			historicalReferences: { signInRosterFilters: 0, signInRosterSnapshots: 0, total: 0 },
			canDelete: true
		},
		warnings: [],
		commands: {
			canEdit: true,
			canRetire: true,
			canReactivate: false,
			canDelete: false,
			deleteDisabledReason: null
		},
		...overrides
	};
}

function renderRankPage(active: SettingsRankCatalogRow[], retired: SettingsRankCatalogRow[] = []) {
	const ranksSettings: RanksSettingsData = {
		sections: {
			ranks: {
				commands: { canManageCatalog: true, canAddServicePack: true, canAddCustomRank: true },
				copy: { payGradeHelp: 'Pay grade help.', tieBreakHelp: 'Tie-break help.' },
				servicePacks: [],
				options: {
					services: [{ value: 'custom', label: 'Custom' }],
					categories: [{ value: 'custom', label: 'Custom' }],
					payGrades: [{ value: 'ungraded', label: 'Ungraded' }],
					states: [
						{ value: 'active', label: 'Active' },
						{ value: 'retired', label: 'Retired' }
					]
				},
				entries: { active, retired }
			}
		}
	};
	const view = render(Page, { data: { ranksSettings } as never, form: null, params: { orgId: 'org-1' } });
	return {
		reject: (message: string) =>
			view.rerender({ data: { ranksSettings } as never, form: { rankError: message }, params: { orgId: 'org-1' } })
	};
}

describe('single rank retirement', () => {
	it('asks before retiring one rank and submits nothing when cancelled', async () => {
		renderRankPage([rankEntry()]);

		await fireEvent.click(screen.getByRole('button', { name: 'Actions for DET-SGT' }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Retire' }));
		expect(screen.getByRole('alertdialog', { name: 'Retire DET-SGT' })).toBeTruthy();
		expect(screen.getByText(/DET-SGT Detachment Sergeant will be hidden from future rank selection/)).toBeTruthy();
		expect(submittedForms).toEqual([]);

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await vi.runAllTimersAsync();
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(submittedForms).toEqual([]);
		expect(screen.getByText('active', { selector: 'span' })).toBeTruthy();
	});

	it('retires the chosen rank through the existing retire command once confirmed', async () => {
		renderRankPage([rankEntry(), rankEntry({ code: 'OTHER', label: 'Other Sergeant' })]);

		await fireEvent.click(screen.getByRole('button', { name: 'Actions for DET-SGT' }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Retire' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Retire rank' }));

		expect(submittedForms).toEqual([{ action: '?/retireRank', fields: { code: 'DET-SGT' } }]);
	});

	it('reactivates a retired rank without a confirmation', async () => {
		renderRankPage(
			[],
			[
				rankEntry({
					code: 'OLD-SGT',
					label: 'Old Sergeant',
					state: 'retired',
					commands: {
						canEdit: true,
						canRetire: false,
						canReactivate: true,
						canDelete: false,
						deleteDisabledReason: null
					}
				})
			]
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Retired' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Actions for OLD-SGT' }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Reactivate' }));

		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(submittedForms).toEqual([{ action: '?/reactivateRank', fields: { code: 'OLD-SGT' } }]);
	});
});

describe('rejected rank saves', () => {
	it('keeps every custom rank value and shows the server error when adding is rejected', async () => {
		const page = renderRankPage([rankEntry()]);

		await fireEvent.click(screen.getByRole('button', { name: 'Add custom rank' }));
		await fireEvent.input(screen.getByLabelText('Code'), { target: { value: 'NEW-1' } });
		await fireEvent.input(screen.getByLabelText('Label'), { target: { value: 'New Rank' } });
		await fireEvent.input(screen.getByLabelText('Tie-break order'), { target: { value: '650' } });
		await fireEvent.submit(screen.getByRole('button', { name: 'Add Rank' }).closest('form') as HTMLFormElement);
		expect(submittedForms[0].action).toBe('?/saveRank');

		await page.reject('Rank code already exists.');
		await heldSubmissions[0]({ result: { type: 'failure' }, update: async () => {} });

		expect(screen.getByText('Rank code already exists.')).toBeTruthy();
		expect((screen.getByLabelText('Code') as HTMLInputElement).value).toBe('NEW-1');
		expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('New Rank');
		expect((screen.getByLabelText('Tie-break order') as HTMLInputElement).value).toBe('650');
	});

	it('keeps the edited label and shows the server error when saving an edit is rejected', async () => {
		const page = renderRankPage([rankEntry()]);

		await fireEvent.click(screen.getByRole('button', { name: 'Show details for DET-SGT' }));
		await fireEvent.input(screen.getByLabelText('Label'), { target: { value: 'Detachment Sergeant Major' } });
		await fireEvent.submit(screen.getByRole('button', { name: 'Save DET-SGT' }).closest('form') as HTMLFormElement);
		expect(submittedForms[0]).toEqual({
			action: '?/saveRank',
			fields: {
				intent: 'edit',
				originalCode: 'DET-SGT',
				code: 'DET-SGT',
				label: 'Detachment Sergeant Major',
				service: 'custom',
				category: 'custom',
				payGrade: 'ungraded',
				state: 'active',
				sortOrder: '500'
			}
		});

		await page.reject('Label is too long.');
		await heldSubmissions[0]({ result: { type: 'failure' }, update: async () => {} });

		expect(screen.getByText('Label is too long.')).toBeTruthy();
		expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('Detachment Sergeant Major');
	});
});
