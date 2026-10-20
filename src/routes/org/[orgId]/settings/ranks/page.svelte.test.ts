// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RanksSettingsData, SettingsRankCatalogRow, SettingsRankServicePackOption } from '../settingsSectionTypes';
import { frameworkOutcome } from '$lib/test-support/sveltekitEnhance';
import Page from './+page.svelte';

type HeldSubmission = (opts: {
	result: { type: 'success' | 'failure' };
	update: (options?: { reset?: boolean }) => Promise<void>;
}) => Promise<void>;
const { heldSubmissions, submittedForms } = vi.hoisted(() => ({
	heldSubmissions: [] as HeldSubmission[],
	submittedForms: [] as Array<{ action: string; fields: Record<string, string> }>
}));

// Holds each enhanced submission until the test settles it. A submission its handler cancels sends no request.
vi.mock('$app/forms', () => ({
	enhance: (
		form: HTMLFormElement,
		submit?: (input: {
			formElement: HTMLFormElement;
			formData: FormData;
			submitter: HTMLElement | null;
			cancel: () => void;
		}) => unknown
	) => {
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			let cancelled = false;
			const settle = submit?.({
				formElement: form,
				formData: new FormData(form),
				submitter: event.submitter,
				cancel: () => {
					cancelled = true;
				}
			}) as HeldSubmission;
			if (cancelled) return;
			submittedForms.push({
				action: form.getAttribute('action') ?? '',
				fields: Object.fromEntries(new FormData(form) as unknown as Iterable<[string, string]>)
			});
			heldSubmissions.push(settle);
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

		const trigger = screen.getByRole('button', { name: 'Actions for Lt Gen' }) as HTMLButtonElement;
		expect(trigger.disabled).toBe(true);
		expect(trigger.getAttribute('aria-busy')).toBe('true');

		await heldSubmissions[0]({ result: { type: 'success' }, update: async () => {} });
		await vi.runAllTimersAsync();
		expect(trigger.disabled).toBe(false);
		expect(trigger.getAttribute('aria-busy')).toBe('false');
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

function rankPack(overrides: Partial<SettingsRankServicePackOption> = {}): SettingsRankServicePackOption {
	return {
		value: 'navy',
		label: 'Navy',
		builtInCount: 25,
		existingCount: 2,
		activeCount: 2,
		retiredCount: 0,
		missingCount: 23,
		isInstalled: false,
		canBulkRetire: true,
		canBulkReactivate: false,
		...overrides
	};
}

function rankSettings(
	active: SettingsRankCatalogRow[],
	retired: SettingsRankCatalogRow[],
	servicePacks: SettingsRankServicePackOption[]
): RanksSettingsData {
	return {
		sections: {
			ranks: {
				commands: { canManageCatalog: true, canAddServicePack: true, canAddCustomRank: true },
				copy: { payGradeHelp: 'Pay grade help.', tieBreakHelp: 'Tie-break help.' },
				servicePacks,
				options: {
					services: [
						{ value: 'army', label: 'Army' },
						{ value: 'custom', label: 'Custom' }
					],
					categories: [
						{ value: 'officer', label: 'Officer' },
						{ value: 'custom', label: 'Custom' }
					],
					payGrades: [
						{ value: 'O-10', label: 'O-10' },
						{ value: 'ungraded', label: 'Ungraded' }
					],
					states: [
						{ value: 'retired', label: 'Retired' },
						{ value: 'active', label: 'Active' }
					]
				},
				entries: { active, retired }
			}
		}
	};
}

function renderRankPage(
	active: SettingsRankCatalogRow[],
	retired: SettingsRankCatalogRow[] = [],
	servicePacks: SettingsRankServicePackOption[] = []
) {
	const view = render(Page, {
		data: { ranksSettings: rankSettings(active, retired, servicePacks) } as never,
		form: null,
		params: { orgId: 'org-1' }
	});
	const show = (
		next: { active: SettingsRankCatalogRow[]; retired?: SettingsRankCatalogRow[] },
		form: { rankError?: string; success?: boolean } | null
	) =>
		view.rerender({
			data: { ranksSettings: rankSettings(next.active, next.retired ?? [], servicePacks) } as never,
			form,
			params: { orgId: 'org-1' }
		});
	return {
		reject: (message: string) => show({ active, retired }, { rankError: message }),
		// What SvelteKit's update() does when the action succeeds: the catalog reloads without the changed rows.
		succeedWith: (next: { active: SettingsRankCatalogRow[]; retired?: SettingsRankCatalogRow[] }) =>
			heldSubmissions[heldSubmissions.length - 1]({
				result: { type: 'success' },
				update: async () => {
					await show(next, { success: true });
				}
			}),
		fail: (message: string) =>
			heldSubmissions[heldSubmissions.length - 1]({
				result: { type: 'failure' },
				update: async () => {
					await show({ active, retired }, { rankError: message });
				}
			})
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

	it('holds every other rank action while one retirement is in flight', async () => {
		renderRankPage([rankEntry(), rankEntry({ code: 'OTHER', label: 'Other Sergeant' })]);

		await fireEvent.click(screen.getByRole('button', { name: 'Actions for DET-SGT' }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Retire' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Retire rank' }));
		expect(submittedForms).toHaveLength(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Actions for OTHER' }));
		expect(screen.getByRole('menuitem', { name: 'Retire' }).getAttribute('aria-disabled')).toBe('true');
		expect(screen.getByRole('button', { name: 'Add custom rank' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Show details for DET-SGT' }));
		expect((screen.getByRole('button', { name: 'Save DET-SGT' }) as HTMLButtonElement).disabled).toBe(true);
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

function retiredCopy(entry: SettingsRankCatalogRow): SettingsRankCatalogRow {
	return {
		...entry,
		state: 'retired',
		commands: { ...entry.commands, canRetire: false, canReactivate: true }
	};
}

const rankA = rankEntry({ code: 'A-1', label: 'Alpha Sergeant' });
const rankB = rankEntry({ code: 'B-2', label: 'Bravo Sergeant' });
const rankC = rankEntry({ code: 'C-3', label: 'Charlie Sergeant' });

async function openRetire(code: string) {
	await fireEvent.click(screen.getByRole('button', { name: `Actions for ${code}` }));
	await fireEvent.click(screen.getByRole('menuitem', { name: 'Retire' }));
	await vi.runAllTimersAsync();
	return screen.getByRole('alertdialog', { name: `Retire ${code}` });
}

describe('rank confirmations settle with their request', () => {
	it('keeps the retire confirmation busy and open until the request succeeds, then closes it', async () => {
		const page = renderRankPage([rankA, rankB]);

		const dialog = await openRetire('A-1');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire rank' }));
		await vi.runAllTimersAsync();

		expect(submittedForms).toEqual([{ action: '?/retireRank', fields: { code: 'A-1' } }]);
		expect(dialog.getAttribute('aria-busy')).toBe('true');
		expect((within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		await vi.runAllTimersAsync();
		expect(screen.getByRole('alertdialog', { name: 'Retire A-1' })).toBe(dialog);

		await page.succeedWith({ active: [rankB], retired: [retiredCopy(rankA)] });
		await vi.runAllTimersAsync();
		expect(screen.queryByRole('alertdialog')).toBeNull();
	});

	it('keeps the retire confirmation open with the server message on failure and retries it', async () => {
		const page = renderRankPage([rankA, rankB]);

		const dialog = await openRetire('A-1');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire rank' }));
		await page.fail('Rank is still referenced.');
		await vi.runAllTimersAsync();

		expect(screen.getByRole('alertdialog', { name: 'Retire A-1' })).toBe(dialog);
		expect(dialog.hasAttribute('aria-busy')).toBe(false);
		expect(within(dialog).getByRole('alert').textContent).toContain('Rank is still referenced.');
		expect(screen.getAllByRole('alert')).toHaveLength(1);
		expect(submittedForms).toHaveLength(1);

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire rank' }));
		expect(submittedForms).toHaveLength(2);
		await page.succeedWith({ active: [rankB], retired: [retiredCopy(rankA)] });
		await vi.runAllTimersAsync();
		expect(screen.queryByRole('alertdialog')).toBeNull();
	});

	it('moves focus to the next row after a retirement removes the row from the active filter', async () => {
		const page = renderRankPage([rankA, rankB, rankC]);

		const dialog = await openRetire('B-2');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire rank' }));
		await page.succeedWith({ active: [rankA, rankC], retired: [retiredCopy(rankB)] });
		await vi.runAllTimersAsync();

		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Actions for C-3' }));
	});

	it('moves focus to the previous row when the last row is retired out of the active filter', async () => {
		const page = renderRankPage([rankA, rankB, rankC]);

		const dialog = await openRetire('C-3');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire rank' }));
		await page.succeedWith({ active: [rankA, rankB], retired: [retiredCopy(rankC)] });
		await vi.runAllTimersAsync();

		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Actions for B-2' }));
	});

	it('moves focus to the Ranks heading when the only row leaves the filter', async () => {
		const page = renderRankPage([rankA]);

		const dialog = await openRetire('A-1');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire rank' }));
		await page.succeedWith({ active: [], retired: [retiredCopy(rankA)] });
		await vi.runAllTimersAsync();

		expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Ranks', level: 2 }));
	});

	it('returns focus to the row actions when the retired row stays in the All filter', async () => {
		const page = renderRankPage([rankA, rankB]);
		await fireEvent.click(screen.getByRole('button', { name: 'All' }));

		const dialog = await openRetire('A-1');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire rank' }));
		await page.succeedWith({ active: [rankB], retired: [retiredCopy(rankA)] });
		await vi.runAllTimersAsync();

		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Actions for A-1' }));
	});

	it('holds the remove confirmation until the request settles, then focuses the next row', async () => {
		const removable = (entry: SettingsRankCatalogRow) => ({
			...entry,
			commands: { ...entry.commands, canDelete: true }
		});
		const page = renderRankPage([removable(rankA), removable(rankB), removable(rankC)]);

		await fireEvent.click(screen.getByRole('button', { name: 'Actions for B-2' }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
		await vi.runAllTimersAsync();
		const dialog = screen.getByRole('alertdialog', { name: 'Remove B-2' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove rank' }));
		await vi.runAllTimersAsync();

		expect(submittedForms).toEqual([{ action: '?/deleteRank', fields: { code: 'B-2' } }]);
		expect(dialog.getAttribute('aria-busy')).toBe('true');

		await page.succeedWith({ active: [removable(rankA), removable(rankC)] });
		await vi.runAllTimersAsync();
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Actions for C-3' }));
	});

	it('holds the bulk confirmation until the request settles, then returns focus to the pack actions', async () => {
		const page = renderRankPage([rankA], [], [rankPack()]);

		await fireEvent.click(screen.getByRole('button', { name: 'More actions for Navy' }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Retire active ranks (2)' }));
		await vi.runAllTimersAsync();
		const dialog = screen.getByRole('alertdialog', { name: 'Retire Navy ranks' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire active ranks' }));
		await vi.runAllTimersAsync();

		expect(submittedForms).toEqual([
			{ action: '?/bulkRankState', fields: { service: 'navy', targetState: 'retired' } }
		]);
		expect(dialog.getAttribute('aria-busy')).toBe('true');

		await page.succeedWith({ active: [rankA] });
		await vi.runAllTimersAsync();
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions for Navy' }));
	});
});

describe('rank mutations do not overlap', () => {
	it('disables Add pack while a retirement is in flight and sends nothing when a second submit is forced', async () => {
		renderRankPage([rankA], [], [rankPack({ isInstalled: false })]);

		const dialog = await openRetire('A-1');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire rank' }));
		expect(submittedForms).toHaveLength(1);

		const addPack = screen.getByRole('button', { name: 'Add Navy', hidden: true }) as HTMLButtonElement;
		expect(addPack.disabled).toBe(true);

		await fireEvent.submit(addPack.closest('form') as HTMLFormElement);
		expect(submittedForms).toHaveLength(1);
	});
});

describe('successful rank saves', () => {
	it('returns the add form to its defaults after a rank is added, so the next add can be submitted', async () => {
		renderRankPage([rankEntry()]);

		await fireEvent.click(screen.getByRole('button', { name: 'Add custom rank' }));
		const form = screen.getByRole('button', { name: 'Add Rank' }).closest('form') as HTMLFormElement;
		await fireEvent.input(screen.getByLabelText('Code'), { target: { value: 'NEW-1' } });
		await fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'army' } });
		await fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'officer' } });
		await fireEvent.change(screen.getByLabelText('Pay grade'), { target: { value: 'O-10' } });
		await fireEvent.input(screen.getByLabelText('Tie-break order'), { target: { value: '650' } });
		await fireEvent.submit(form);
		// SvelteKit's update() resets the submitted form after a successful action.
		await heldSubmissions[0]({ result: { type: 'success' }, update: async () => form.reset() });

		const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement | HTMLSelectElement).value;
		expect([value('Code'), value('Branch'), value('Category'), value('Pay grade'), value('State')]).toEqual([
			'',
			'custom',
			'custom',
			'ungraded',
			'active'
		]);
		expect(value('Tie-break order')).toBe('500');
	});

	it('keeps the saved values in an open edit form after the save succeeds', async () => {
		const view = render(Page, {
			data: { ranksSettings: rankSettings([rankEntry()], [], []) } as never,
			form: null,
			params: { orgId: 'org-1' }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Show details for DET-SGT' }));
		const form = screen.getByRole('button', { name: 'Save DET-SGT' }).closest('form') as HTMLFormElement;
		await fireEvent.input(screen.getByLabelText('Label'), { target: { value: 'Detachment Lead' } });
		await fireEvent.change(screen.getByLabelText('Pay grade'), { target: { value: 'O-10' } });
		await fireEvent.submit(form);
		const saved = rankEntry({ label: 'Detachment Lead', payGrade: 'O-10', payGradeLabel: 'O-10' });
		// SvelteKit's update() resets the form unless told not to, then reloads the page data.
		await heldSubmissions[0]({
			result: { type: 'success' },
			update: async (options?: { reset?: boolean }) => {
				if (options?.reset !== false) form.reset();
				await view.rerender({
					data: { ranksSettings: rankSettings([saved], [], []) } as never,
					form: { success: true },
					params: { orgId: 'org-1' }
				});
			}
		});

		expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('Detachment Lead');
		expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('custom');
		expect((screen.getByLabelText('Pay grade') as HTMLSelectElement).value).toBe('O-10');
		expect((screen.getByLabelText('Tie-break order') as HTMLInputElement).value).toBe('500');
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

	it.each([
		['Code', 'Rank catalog entry already exists. Edit it instead.'],
		['Code', 'Rank code is required'],
		['Label', 'Rank label is required'],
		['Tie-break order', 'Tie-break order must be a whole number.'],
		['Tie-break order', 'Tie-break order must fit within PostgreSQL integer range.']
	])('attaches the rejected %s to its own field: %s', async (fieldLabel, message) => {
		const page = renderRankPage([rankEntry()]);

		await fireEvent.click(screen.getByRole('button', { name: 'Add custom rank' }));
		await fireEvent.input(screen.getByLabelText('Code'), { target: { value: 'NEW-1' } });
		await fireEvent.submit(screen.getByRole('button', { name: 'Add Rank' }).closest('form') as HTMLFormElement);
		await page.reject(message);
		await heldSubmissions[0]({ result: { type: 'failure' }, update: async () => {} });

		const field = screen.getByLabelText(fieldLabel);
		expect(field.getAttribute('aria-invalid')).toBe('true');
		const error = screen.getByText(message);
		expect(error.getAttribute('data-slot')).toBe('field-error');
		expect(field.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
		for (const other of ['Code', 'Label', 'Tie-break order'].filter((label) => label !== fieldLabel)) {
			expect(screen.getByLabelText(other).getAttribute('aria-invalid')).toBeNull();
		}
		expect(screen.getAllByRole('alert')).toEqual([error]);
	});

	it('attaches a rejected edit label and tie-break to the edit form fields', async () => {
		const page = renderRankPage([rankEntry()]);

		await fireEvent.click(screen.getByRole('button', { name: 'Show details for DET-SGT' }));
		await fireEvent.submit(screen.getByRole('button', { name: 'Save DET-SGT' }).closest('form') as HTMLFormElement);
		await page.reject('Rank label is required');
		await heldSubmissions[0]({ result: { type: 'failure' }, update: async () => {} });

		const label = screen.getByLabelText('Label');
		expect(label.getAttribute('aria-invalid')).toBe('true');
		expect(label.getAttribute('aria-describedby')).toBe(screen.getByText('Rank label is required').id);
		expect(screen.getByLabelText('Tie-break order').getAttribute('aria-invalid')).toBeNull();
	});

	it('keeps a Code failure of the read-only edit form in the form alert', async () => {
		const page = renderRankPage([rankEntry()]);

		await fireEvent.click(screen.getByRole('button', { name: 'Show details for DET-SGT' }));
		await fireEvent.submit(screen.getByRole('button', { name: 'Save DET-SGT' }).closest('form') as HTMLFormElement);
		await page.reject('Rank code is required');
		await heldSubmissions[0]({ result: { type: 'failure' }, update: async () => {} });

		expect(screen.getByText('Rank code is required').getAttribute('data-slot')).not.toBe('field-error');
		expect(screen.getByLabelText('Code').getAttribute('aria-invalid')).toBeNull();
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

describe('held rank saves keep focus', () => {
	async function submitAndHold(name: string) {
		const button = screen.getByRole('button', { name }) as HTMLButtonElement;
		button.focus();
		(button.closest('form') as HTMLFormElement).requestSubmit(button);
		await vi.runAllTimersAsync();
		expect(button.disabled).toBe(true);
	}

	function renderSettled(active: SettingsRankCatalogRow[], packs: SettingsRankServicePackOption[] = []) {
		const view = render(Page, {
			data: { ranksSettings: rankSettings(active, [], packs) } as never,
			form: null,
			params: { orgId: 'org-1' }
		});
		// SvelteKit's update() moves focus to the body after a success.
		return (next: { active: SettingsRankCatalogRow[]; packs?: SettingsRankServicePackOption[] }) =>
			heldSubmissions[0](
				frameworkOutcome(
					{ type: 'success', status: 200 },
					{
						applyForm: (form) =>
							view.rerender({
								data: { ranksSettings: rankSettings(next.active, [], next.packs ?? packs) } as never,
								form: form as never,
								params: { orgId: 'org-1' }
							})
					}
				) as never
			);
	}

	it('returns focus to Add Rank once a held add succeeds', async () => {
		const succeed = renderSettled([rankEntry()]);
		await fireEvent.click(screen.getByRole('button', { name: 'Add custom rank' }));
		await fireEvent.input(screen.getByLabelText('Code'), { target: { value: 'NEW-1' } });
		await fireEvent.input(screen.getByLabelText('Label'), { target: { value: 'New rank' } });

		await submitAndHold('Add Rank');
		await succeed({ active: [rankEntry(), rankEntry({ code: 'NEW-1', label: 'New rank' })] });

		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Rank' }));
	});

	it('returns focus to the row Save once a held edit succeeds', async () => {
		const succeed = renderSettled([rankEntry()]);
		await fireEvent.click(screen.getByRole('button', { name: 'Show details for DET-SGT' }));

		await submitAndHold('Save DET-SGT');
		await succeed({ active: [rankEntry({ label: 'Detachment Lead' })] });

		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save DET-SGT' }));
	});

	it('moves focus to the Ranks heading when a held edit removes its row from the filter', async () => {
		const succeed = renderSettled([rankEntry()]);
		await fireEvent.click(screen.getByRole('button', { name: 'Show details for DET-SGT' }));

		await submitAndHold('Save DET-SGT');
		await succeed({ active: [] });

		expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Ranks', level: 2 }));
	});

	it('moves focus to the pack actions once a held pack add leaves Added disabled', async () => {
		const succeed = renderSettled([rankEntry()], [rankPack()]);

		await submitAndHold('Add Navy');
		await succeed({ active: [rankEntry()], packs: [rankPack({ isInstalled: true })] });

		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions for Navy' }));
	});
});
