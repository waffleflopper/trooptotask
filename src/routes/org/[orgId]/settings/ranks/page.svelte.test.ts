// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RanksSettingsData, SettingsRankCatalogRow, SettingsRankServicePackOption } from '../settingsSectionTypes';
import Page from './+page.svelte';

type HeldSubmission = (opts: {
	result: { type: 'success' | 'failure'; data?: Record<string, unknown> };
	update: (options?: { reset?: boolean }) => Promise<void>;
}) => Promise<void>;
const { heldSubmissions, submittedForms, toasts } = vi.hoisted(() => ({
	heldSubmissions: [] as HeldSubmission[],
	submittedForms: [] as Array<{ action: string; fields: Record<string, string> }>,
	toasts: [] as string[]
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	toastStore: { success: (message: string) => toasts.push(message) }
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
				// happy-dom reports the form itself for a bare requestSubmit(); browsers report no submitter.
				submitter: event.submitter === form ? null : event.submitter,
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
	// Dialog/menu unmount schedules body-style restoration. Run it while happy-dom still exists.
	await vi.runAllTimersAsync();
	expect(vi.getTimerCount()).toBe(0);
}

afterEach(async () => {
	heldSubmissions.length = 0;
	submittedForms.length = 0;
	toasts.length = 0;
	try {
		await cleanupRankPage();
	} finally {
		vi.useRealTimers();
	}
});

function rankEntry(overrides: Partial<SettingsRankCatalogRow> = {}): SettingsRankCatalogRow {
	const code = overrides.code ?? 'DET-SGT';
	return {
		code,
		label: 'Detachment Sergeant',
		service: 'custom',
		serviceLabel: 'Custom',
		category: 'enlisted',
		categoryLabel: 'Enlisted',
		payGrade: 'E-6',
		payGradeLabel: 'E-6',
		state: 'active',
		source: 'custom',
		sourceLabel: 'Custom',
		sortOrder: 500,
		referenceSummary: {
			code,
			activeReferences: { personnel: 0, trainingApplicability: 0, total: 0 },
			historicalReferences: { signInRosterFilters: 0, signInRosterSnapshots: 0, total: 0 },
			canDelete: true
		},
		warnings: [],
		commands: {
			canEdit: true,
			canRetire: true,
			canReactivate: false,
			canDelete: true,
			deleteDisabledReason: null
		},
		...overrides
	};
}

function builtIn(overrides: Partial<SettingsRankCatalogRow> & { code: string; label: string }): SettingsRankCatalogRow {
	return rankEntry({
		service: 'army',
		serviceLabel: 'Army',
		source: 'built-in',
		sourceLabel: 'Built-in',
		commands: {
			canEdit: false,
			canRetire: true,
			canReactivate: false,
			canDelete: false,
			deleteDisabledReason: 'Built-in ranks can be retired but not removed.'
		},
		...overrides
	});
}

function retiredCopy(entry: SettingsRankCatalogRow): SettingsRankCatalogRow {
	return { ...entry, state: 'retired', commands: { ...entry.commands, canRetire: false, canReactivate: true } };
}

function rankPack(overrides: Partial<SettingsRankServicePackOption> = {}): SettingsRankServicePackOption {
	return {
		value: 'army',
		label: 'Army',
		builtInCount: 29,
		existingCount: 27,
		activeCount: 25,
		retiredCount: 2,
		missingCount: 2,
		isInstalled: false,
		canBulkRetire: true,
		canBulkReactivate: true,
		...overrides
	};
}

function rankSettings(
	active: SettingsRankCatalogRow[],
	retired: SettingsRankCatalogRow[],
	servicePacks: SettingsRankServicePackOption[],
	canManageCatalog = true
): RanksSettingsData {
	return {
		sections: {
			ranks: {
				commands: {
					canManageCatalog,
					canAddServicePack: canManageCatalog,
					canAddCustomRank: canManageCatalog
				},
				copy: { payGradeHelp: 'Pay grade help.', tieBreakHelp: 'Tie-break help.' },
				servicePacks,
				options: {
					services: [
						{ value: 'army', label: 'Army' },
						{ value: 'custom', label: 'Custom' }
					],
					categories: [
						{ value: 'enlisted', label: 'Enlisted' },
						{ value: 'custom', label: 'Custom' }
					],
					payGrades: [
						{ value: 'E-6', label: 'E-6' },
						{ value: 'E-7', label: 'E-7' },
						{ value: 'ungraded', label: 'Ungraded' }
					],
					states: [
						{ value: 'active', label: 'Active' },
						{ value: 'retired', label: 'Retired' }
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
	servicePacks: SettingsRankServicePackOption[] = [],
	canManageCatalog = true
) {
	const view = render(Page, {
		data: { ranksSettings: rankSettings(active, retired, servicePacks, canManageCatalog) } as never,
		form: null,
		params: { orgId: 'org-1' }
	});
	type Next = {
		active: SettingsRankCatalogRow[];
		retired?: SettingsRankCatalogRow[];
		servicePacks?: SettingsRankServicePackOption[];
	};
	const show = (next: Next, form: { rankError?: string; success?: boolean } | null) =>
		view.rerender({
			data: {
				ranksSettings: rankSettings(next.active, next.retired ?? [], next.servicePacks ?? servicePacks)
			} as never,
			form,
			params: { orgId: 'org-1' }
		});
	return {
		// What SvelteKit's update() does when the action succeeds: the catalog reloads and focus drops to the body.
		succeedWith: async (next: Next, data: Record<string, unknown> = {}) => {
			await heldSubmissions[heldSubmissions.length - 1]({
				result: { type: 'success', data },
				update: async () => {
					await show(next, { success: true });
					(document.activeElement as HTMLElement | null)?.blur();
				}
			});
			await vi.runAllTimersAsync();
		},
		fail: async (message: string) => {
			await heldSubmissions[heldSubmissions.length - 1]({
				result: { type: 'failure' },
				update: async () => {
					await show({ active, retired }, { rankError: message });
				}
			});
			await vi.runAllTimersAsync();
		}
	};
}

function catalog() {
	return screen.getByRole('table', { name: 'Organization ranks' });
}

function shownCodes(): string[] {
	return within(catalog())
		.queryAllByRole('rowheader')
		.map((cell) => cell.textContent!.trim().split(/\s+/)[0]);
}

function rowFor(code: string): HTMLElement {
	return screen.getByRole('button', { name: new RegExp(`^${code} `) }).closest('tr')!;
}

function rankToggle(code: string): HTMLElement {
	return screen.getByRole('button', { name: new RegExp(`^${code} `) });
}

async function openRank(code: string) {
	await fireEvent.click(rankToggle(code));
	await vi.runAllTimersAsync();
}

function submitWith(button: HTMLElement) {
	(button as HTMLButtonElement).focus();
	(button as HTMLButtonElement).form!.requestSubmit(button as HTMLButtonElement);
}

describe('branch coverage', () => {
	it('shows each branch with its counts and adds the missing ranks', async () => {
		const page = renderRankPage(
			[],
			[],
			[
				rankPack(),
				rankPack({
					value: 'navy',
					label: 'Navy',
					builtInCount: 27,
					existingCount: 0,
					activeCount: 0,
					retiredCount: 0,
					missingCount: 27,
					canBulkRetire: false,
					canBulkReactivate: false
				})
			]
		);

		const army = screen.getByRole('heading', { name: 'Army', level: 3 }).closest('li')!;
		expect(within(army).getByRole('img').getAttribute('aria-label')).toBe(
			'Army: 25 active, 2 retired, 2 missing of 29 built-in ranks'
		);
		expect(within(army).getByText('25 · 2 retired')).toBeTruthy();
		expect(within(army).getByText('2 missing')).toBeTruthy();
		const navy = screen.getByRole('heading', { name: 'Navy', level: 3 }).closest('li')!;
		expect(within(navy).getByText('Not added')).toBeTruthy();
		expect(within(navy).getByText('27 ranks')).toBeTruthy();
		expect(within(navy).queryByRole('button', { name: 'More actions for Navy' })).toBeNull();

		submitWith(screen.getByRole('button', { name: 'Add 27 Navy ranks' }));
		expect(submittedForms).toEqual([{ action: '?/addServicePack', fields: { service: 'navy' } }]);
		await page.succeedWith({
			active: [],
			servicePacks: [
				rankPack(),
				rankPack({
					value: 'navy',
					label: 'Navy',
					builtInCount: 27,
					existingCount: 27,
					activeCount: 27,
					retiredCount: 0,
					missingCount: 0,
					isInstalled: true
				})
			]
		});
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions for Navy' }));
		expect(toasts).toEqual(['Rank catalog updated.']);
	});

	it('offers no Add once a branch has every built-in rank', () => {
		renderRankPage(
			[],
			[],
			[rankPack({ existingCount: 29, activeCount: 29, retiredCount: 0, missingCount: 0, isInstalled: true })]
		);

		const army = screen.getByRole('heading', { name: 'Army', level: 3 }).closest('li')!;
		expect(within(army).getByText('29 active')).toBeTruthy();
		expect(within(army).queryByRole('button', { name: /^Add / })).toBeNull();
		expect(within(army).getByRole('button', { name: 'More actions for Army' })).toBeTruthy();
	});

	it('retires a whole branch after a confirmation and returns focus to its menu', async () => {
		const page = renderRankPage([], [], [rankPack()]);

		await fireEvent.click(screen.getByRole('button', { name: 'More actions for Army' }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Retire active ranks (25)' }));
		await vi.runAllTimersAsync();
		const dialog = screen.getByRole('alertdialog', { name: 'Retire Army ranks' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire active ranks' }));

		expect(submittedForms).toEqual([
			{ action: '?/bulkRankState', fields: { service: 'army', targetState: 'retired' } }
		]);
		expect(dialog.getAttribute('aria-busy')).toBe('true');
		await page.succeedWith({ active: [] });
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions for Army' }));
	});
});

describe('catalog filters', () => {
	const sgt = builtIn({ code: 'SGT', label: 'Sergeant', payGrade: 'E-5', payGradeLabel: 'E-5' });
	const sfc = builtIn({ code: 'SFC', label: 'Sergeant First Class', payGrade: 'E-7', payGradeLabel: 'E-7' });
	const detSgt = rankEntry();
	const sp4 = retiredCopy(builtIn({ code: 'SP4', label: 'Specialist Four', payGrade: 'E-4', payGradeLabel: 'E-4' }));

	it('lists every rank by precedence, then narrows by state, branch and search together', async () => {
		renderRankPage([sgt, detSgt, sfc], [sp4]);

		expect(shownCodes()).toEqual(['SFC', 'DET-SGT', 'SGT', 'SP4']);
		expect(screen.getByRole('radio', { name: 'All' }).getAttribute('aria-checked')).toBe('true');

		await fireEvent.click(screen.getByRole('radio', { name: 'Active' }));
		expect(shownCodes()).toEqual(['SFC', 'DET-SGT', 'SGT']);

		await fireEvent.change(screen.getByRole('combobox', { name: 'Filter ranks by branch' }), {
			target: { value: 'army' }
		});
		expect(shownCodes()).toEqual(['SFC', 'SGT']);

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search ranks' }), { target: { value: 'first' } });
		expect(shownCodes()).toEqual(['SFC']);
		expect(screen.getByRole('status').textContent).toBe('1 of 4 ranks shown');

		await fireEvent.click(screen.getByRole('radio', { name: 'Retired' }));
		expect(shownCodes()).toEqual([]);
		expect(screen.getByText('No retired ranks match Army and "first".')).toBeTruthy();
	});

	it('counts active, retired and custom ranks in the section head', () => {
		renderRankPage([sgt, detSgt, sfc], [sp4]);

		expect(screen.getByText('3 active · 1 retired · 1 custom')).toBeTruthy();
	});
});

describe('catalog sorting', () => {
	const sgt = builtIn({ code: 'SGT', label: 'Sergeant', payGrade: 'E-5', payGradeLabel: 'E-5' });
	const sfc = builtIn({ code: 'SFC', label: 'Sergeant First Class', payGrade: 'E-7', payGradeLabel: 'E-7' });
	const detSgt = rankEntry();
	const sp4 = retiredCopy(builtIn({ code: 'SP4', label: 'Specialist Four', payGrade: 'E-4', payGradeLabel: 'E-4' }));

	it('sorts by a lane and back, with rank order as the default', async () => {
		renderRankPage([sgt, detSgt, sfc], [sp4]);

		expect(screen.getByRole('columnheader', { name: /Rank/ })).toHaveAttribute('aria-sort', 'ascending');
		await fireEvent.click(screen.getByRole('button', { name: 'Sort by Branch' }));
		expect(shownCodes()).toEqual(['SFC', 'SGT', 'SP4', 'DET-SGT']);
		await fireEvent.click(screen.getByRole('button', { name: 'Sort by Branch' }));
		expect(shownCodes()).toEqual(['DET-SGT', 'SP4', 'SGT', 'SFC']);
		await fireEvent.click(screen.getByRole('button', { name: 'Sort by State' }));
		expect(shownCodes()).toEqual(['SFC', 'DET-SGT', 'SGT', 'SP4']);
		await fireEvent.click(screen.getByRole('button', { name: 'Sort by Rank' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Sort by Rank' }));
		expect(shownCodes()).toEqual(['SP4', 'SGT', 'DET-SGT', 'SFC']);
	});

	it('keeps the new-rank draft first in either direction', async () => {
		renderRankPage([sgt, detSgt, sfc]);

		await fireEvent.click(screen.getByRole('button', { name: 'Add custom rank' }));
		expect(shownCodes()).toEqual(['New', 'SFC', 'DET-SGT', 'SGT']);
		await fireEvent.click(screen.getByRole('button', { name: 'Sort by Rank' }));
		expect(shownCodes()).toEqual(['New', 'SGT', 'DET-SGT', 'SFC']);
	});
});

describe('In use', () => {
	it('reads the people who hold a rank in its row', () => {
		renderRankPage([
			rankEntry({
				code: 'A',
				label: 'A label',
				referenceSummary: {
					code: 'A',
					activeReferences: { personnel: 14, trainingApplicability: 1, total: 15 },
					historicalReferences: { signInRosterFilters: 3, signInRosterSnapshots: 0, total: 3 },
					canDelete: false
				}
			})
		]);

		expect(within(rowFor('A')).getByRole('cell', { name: '14 people' })).toBeInTheDocument();
	});
});

describe('editing a rank in place', () => {
	it('opens the row with Label focused, keeps Code fixed, saves the four fields and stays open', async () => {
		const page = renderRankPage([rankEntry(), rankEntry({ code: 'OTHER', label: 'Other Sergeant' })]);

		await openRank('DET-SGT');
		expect(rankToggle('DET-SGT').getAttribute('aria-expanded')).toBe('true');
		const editor = screen.getByRole('form', { name: 'Edit DET-SGT' });
		expect(document.activeElement).toBe(within(editor).getByLabelText('Label'));
		expect(within(editor).queryByLabelText('Code')).toBeNull();

		await fireEvent.input(within(editor).getByLabelText('Label'), { target: { value: 'Detachment Lead' } });
		await fireEvent.change(within(editor).getByLabelText('Pay grade'), { target: { value: 'E-7' } });
		await fireEvent.input(within(editor).getByLabelText('Tie-break'), { target: { value: '250' } });
		submitWith(screen.getByRole('button', { name: 'Save DET-SGT' }));

		expect(submittedForms).toEqual([
			{
				action: '?/saveRank',
				fields: {
					intent: 'edit',
					service: 'custom',
					state: 'active',
					code: 'DET-SGT',
					originalCode: 'DET-SGT',
					label: 'Detachment Lead',
					category: 'enlisted',
					payGrade: 'E-7',
					sortOrder: '250'
				}
			}
		]);

		await page.succeedWith({
			active: [rankEntry({ label: 'Detachment Lead' }), rankEntry({ code: 'OTHER', label: 'Other Sergeant' })]
		});
		const saved = screen.getByRole('form', { name: 'Edit DET-SGT' });
		expect(within(saved).getByLabelText('Label')).toHaveValue('Detachment Lead');
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save DET-SGT' }));

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await vi.runAllTimersAsync();
		expect(screen.queryByRole('form', { name: 'Edit DET-SGT' })).toBeNull();
		expect(document.activeElement).toBe(rankToggle('DET-SGT'));
	});

	it('describes Tie-break with its own help', async () => {
		renderRankPage([rankEntry()]);

		await openRank('DET-SGT');
		expect(screen.getByLabelText('Tie-break')).toHaveAccessibleDescription('Tie-break help.');
	});

	it('cancels with Escape and returns focus to the row', async () => {
		renderRankPage([rankEntry()]);

		await openRank('DET-SGT');
		await fireEvent.keyDown(screen.getByLabelText('Label'), { key: 'Escape' });
		await vi.runAllTimersAsync();

		expect(screen.queryByRole('form', { name: 'Edit DET-SGT' })).toBeNull();
		expect(document.activeElement).toBe(rankToggle('DET-SGT'));
		expect(submittedForms).toEqual([]);
	});

	it('keeps the typed values and marks the field the server rejected', async () => {
		const page = renderRankPage([rankEntry()]);

		await openRank('DET-SGT');
		await fireEvent.input(screen.getByLabelText('Label'), { target: { value: 'Detachment Lead' } });
		await fireEvent.input(screen.getByLabelText('Tie-break'), { target: { value: '' } });
		submitWith(screen.getByRole('button', { name: 'Save DET-SGT' }));
		await page.fail('Tie-break order must be a whole number.');

		const tieBreak = screen.getByLabelText('Tie-break');
		const error = screen.getByText('Tie-break order must be a whole number.');
		expect(tieBreak.getAttribute('aria-invalid')).toBe('true');
		expect(tieBreak.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
		expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('Detachment Lead');
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save DET-SGT' }));
	});

	it('says why a built-in rank stays and offers Retire without fields', async () => {
		renderRankPage([
			builtIn({ code: 'Lt Gen', label: 'Lieutenant General', service: 'air-force', serviceLabel: 'Air Force' })
		]);

		await openRank('Lt Gen');
		const editor = document.getElementById(rankToggle('Lt Gen').getAttribute('aria-controls')!)!;
		expect(within(editor).getByText('Built-in ranks can be retired but not removed.')).toBeTruthy();
		expect(within(editor).queryByRole('textbox')).toBeNull();
		expect(within(editor).queryByRole('button', { name: 'Remove' })).toBeNull();
		expect(document.activeElement).toBe(within(editor).getByRole('button', { name: 'Retire' }));

		await fireEvent.click(within(editor).getByRole('button', { name: 'Retire' }));
		await vi.runAllTimersAsync();
		expect(screen.getByRole('alertdialog', { name: 'Retire Lt Gen' })).toBeTruthy();
	});

	it('removes an unused custom rank after a destructive confirmation', async () => {
		const page = renderRankPage([rankEntry(), rankEntry({ code: 'OTHER', label: 'Other Sergeant' })]);

		await openRank('DET-SGT');
		await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
		await vi.runAllTimersAsync();
		const dialog = screen.getByRole('alertdialog', { name: 'Remove DET-SGT' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove rank' }));
		expect(submittedForms).toEqual([{ action: '?/deleteRank', fields: { code: 'DET-SGT' } }]);

		await page.succeedWith({ active: [rankEntry({ code: 'OTHER', label: 'Other Sergeant' })] });
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(document.activeElement).toBe(rankToggle('OTHER'));
	});

	it('reactivates a retired rank from its row without a confirmation', async () => {
		renderRankPage([], [retiredCopy(rankEntry())]);

		await openRank('DET-SGT');
		await fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));

		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(submittedForms).toEqual([{ action: '?/reactivateRank', fields: { code: 'DET-SGT' } }]);
	});
});

describe('adding a custom rank', () => {
	it('opens a blank editor as the first row with Code focused and adds an active custom rank', async () => {
		const page = renderRankPage([builtIn({ code: 'SGT', label: 'Sergeant' })]);

		await fireEvent.click(screen.getByRole('button', { name: 'Add custom rank' }));
		await vi.runAllTimersAsync();
		expect(document.activeElement).toBe(screen.getByLabelText('Code'));

		await fireEvent.input(screen.getByLabelText('Code'), { target: { value: 'NEW-1' } });
		await fireEvent.input(screen.getByLabelText('Label'), { target: { value: 'New rank' } });
		submitWith(screen.getByRole('button', { name: 'Add rank' }));
		expect(submittedForms).toEqual([
			{
				action: '?/saveRank',
				fields: {
					intent: 'add',
					service: 'custom',
					state: 'active',
					code: 'NEW-1',
					label: 'New rank',
					category: 'custom',
					payGrade: 'ungraded',
					sortOrder: '500'
				}
			}
		]);

		await page.succeedWith(
			{ active: [builtIn({ code: 'SGT', label: 'Sergeant' }), rankEntry({ code: 'NEW-1', label: 'New rank' })] },
			{ code: 'NEW-1' }
		);
		expect(screen.queryByLabelText('Code')).toBeNull();
		expect(document.activeElement).toBe(rankToggle('NEW-1'));
	});

	it.each([
		['Code', 'Rank catalog entry already exists. Edit it instead.'],
		['Label', 'Rank label is required'],
		['Tie-break', 'Tie-break order must fit within PostgreSQL integer range.']
	])('keeps the draft and attaches a rejected %s to its field', async (fieldLabel, message) => {
		const page = renderRankPage([rankEntry()]);

		await fireEvent.click(screen.getByRole('button', { name: 'Add custom rank' }));
		await fireEvent.input(screen.getByLabelText('Code'), { target: { value: 'NEW-1' } });
		await fireEvent.input(screen.getByLabelText('Label'), { target: { value: 'New rank' } });
		submitWith(screen.getByRole('button', { name: 'Add rank' }));
		await page.fail(message);

		const field = screen.getByLabelText(fieldLabel);
		expect(field).toHaveAttribute('aria-invalid', 'true');
		expect(field).toHaveAccessibleDescription(expect.stringContaining(message));
		expect(screen.getByLabelText('Code')).toHaveValue('NEW-1');
	});

	it('closes the draft on Escape and returns focus to Add custom rank', async () => {
		renderRankPage([rankEntry()]);

		await fireEvent.click(screen.getByRole('button', { name: 'Add custom rank' }));
		await vi.runAllTimersAsync();
		await fireEvent.keyDown(screen.getByLabelText('Code'), { key: 'Escape' });
		await vi.runAllTimersAsync();

		expect(screen.queryByLabelText('Code')).toBeNull();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add custom rank' }));
	});
});

describe('confirmations settle with their request', () => {
	const rankA = rankEntry({
		code: 'A-1',
		label: 'Alpha Sergeant',
		commands: { ...rankEntry().commands, canDelete: false }
	});
	const rankB = rankEntry({
		code: 'B-2',
		label: 'Bravo Sergeant',
		commands: { ...rankEntry().commands, canDelete: false }
	});

	async function openRetire(code: string) {
		await fireEvent.click(screen.getByRole('button', { name: `Actions for ${code}` }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Retire' }));
		await vi.runAllTimersAsync();
		return screen.getByRole('alertdialog', { name: `Retire ${code}` });
	}

	it('submits nothing when the retirement is cancelled', async () => {
		renderRankPage([rankA]);

		const dialog = await openRetire('A-1');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		await vi.runAllTimersAsync();

		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(submittedForms).toEqual([]);
	});

	it('stays open and busy until the request succeeds, then focuses the retired row', async () => {
		const page = renderRankPage([rankA, rankB]);

		const dialog = await openRetire('A-1');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire rank' }));
		await vi.runAllTimersAsync();
		expect(submittedForms).toEqual([{ action: '?/retireRank', fields: { code: 'A-1' } }]);
		expect(dialog.getAttribute('aria-busy')).toBe('true');
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		await vi.runAllTimersAsync();
		expect(screen.getByRole('alertdialog', { name: 'Retire A-1' })).toBe(dialog);

		await page.succeedWith({ active: [rankB], retired: [retiredCopy(rankA)] });
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(document.activeElement).toBe(rankToggle('A-1'));
	});

	it('keeps the server message in the open dialog on failure and retries from it', async () => {
		const page = renderRankPage([rankA, rankB]);

		const dialog = await openRetire('A-1');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire rank' }));
		await page.fail('Rank is still referenced.');

		expect(screen.getByRole('alertdialog', { name: 'Retire A-1' })).toBe(dialog);
		expect(within(dialog).getByRole('alert').textContent).toContain('Rank is still referenced.');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire rank' }));
		expect(submittedForms[1]).toEqual({ action: '?/retireRank', fields: { code: 'A-1' } });
	});

	it('moves focus to the next row when a retirement leaves the Active filter', async () => {
		const page = renderRankPage([rankA, rankB]);
		await fireEvent.click(screen.getByRole('radio', { name: 'Active' }));

		const dialog = await openRetire('A-1');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire rank' }));
		await page.succeedWith({ active: [rankB], retired: [retiredCopy(rankA)] });

		expect(document.activeElement).toBe(rankToggle('B-2'));
	});

	it.each([
		['the last row', [rankA, rankB], 'B-2', () => rankToggle('A-1')],
		[
			'the only row',
			[rankB],
			'B-2',
			() => {
				const region = screen.getByRole('region', { name: /^Catalog/ });
				return document.getElementById(region.getAttribute('aria-labelledby')!);
			}
		]
	])('moves focus past %s when a retirement leaves the Active filter', async (_case, active, code, expected) => {
		const page = renderRankPage(active);
		await fireEvent.click(screen.getByRole('radio', { name: 'Active' }));

		const dialog = await openRetire(code);
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire rank' }));
		const target = active.find((rank) => rank.code === code)!;
		await page.succeedWith({ active: active.filter((rank) => rank !== target), retired: [retiredCopy(target)] });

		expect(document.activeElement).toBe(expected());
	});

	it('moves focus to the next row when a reactivation leaves the Retired filter', async () => {
		const page = renderRankPage([], [retiredCopy(rankA), retiredCopy(rankB)]);
		await fireEvent.click(screen.getByRole('radio', { name: 'Retired' }));

		await openRank('A-1');
		await fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));
		await page.succeedWith({ active: [rankA], retired: [retiredCopy(rankB)] });

		expect(document.activeElement).toBe(rankToggle('B-2'));
	});

	it('leaves another editor opened during a reactivation as the user left it', async () => {
		const page = renderRankPage([rankB], [retiredCopy(rankA)]);

		await fireEvent.click(within(catalog()).getByRole('button', { name: /Actions for A-1/ }));
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Reactivate' }));
		await openRank('B-2');
		await fireEvent.input(screen.getByLabelText('Label'), { target: { value: 'Unsaved label' } });
		await page.succeedWith({ active: [rankA, rankB], retired: [] });

		expect(rankToggle('B-2').getAttribute('aria-expanded')).toBe('true');
		expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('Unsaved label');
		expect(document.activeElement).toBe(screen.getByLabelText('Label'));
	});

	it('leaves another editor opened during a save as the user left it', async () => {
		const page = renderRankPage([rankA, rankB]);

		await openRank('A-1');
		submitWith(screen.getByRole('button', { name: 'Save A-1' }));
		await openRank('B-2');
		await fireEvent.input(screen.getByLabelText('Label'), { target: { value: 'Unsaved label' } });
		await page.succeedWith({ active: [rankA, rankB] }, { code: 'A-1' });

		expect(rankToggle('B-2').getAttribute('aria-expanded')).toBe('true');
		expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('Unsaved label');
		expect(document.activeElement).toBe(screen.getByLabelText('Label'));
	});

	it('runs one rank request at a time', async () => {
		renderRankPage([rankA], [], [rankPack()]);

		const dialog = await openRetire('A-1');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Retire rank' }));
		const addPack = screen.getByRole('button', { name: 'Add 2 Army ranks', hidden: true }) as HTMLButtonElement;
		expect(addPack.disabled).toBe(true);

		await fireEvent.submit(addPack.form!);
		expect(submittedForms.map((form) => form.action)).toEqual(['?/retireRank']);
	});
});

describe('view only', () => {
	it('explains who can change the catalog and offers no changes', async () => {
		renderRankPage(
			[
				rankEntry({
					commands: {
						canEdit: false,
						canRetire: false,
						canReactivate: false,
						canDelete: false,
						deleteDisabledReason: null
					}
				})
			],
			[],
			[rankPack({ canBulkRetire: false, canBulkReactivate: false })],
			false
		);

		expect(
			screen.getByText(
				'Organization admin or owner access is required to change branch packs, custom ranks, or retirement state.'
			)
		).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Add custom rank' })).toBeNull();
		expect((screen.getByRole('button', { name: 'Add 2 Army ranks' }) as HTMLButtonElement).disabled).toBe(true);
		await openRank('DET-SGT');
		expect(screen.queryByRole('form', { name: 'Edit DET-SGT' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Retire' })).toBeNull();
	});
});
