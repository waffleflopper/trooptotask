// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RanksSettingsData, SettingsRankCatalogRow, SettingsRankServicePackOption } from '../settingsSectionTypes';
import Page from './+page.svelte';

type ActionResult = { type: 'success' | 'failure'; status?: number; data?: Record<string, unknown> };
type HeldSubmission = (opts: {
	result: ActionResult;
	update: (options?: { reset?: boolean }) => Promise<void>;
}) => Promise<void>;
type HeldPost = { action: string; fields: Array<[string, string]>; answer: (result: ActionResult) => Promise<void> };

const { heldPosts, heldSubmissions, submittedForms, invalidateAll } = vi.hoisted(() => ({
	heldPosts: [] as HeldPost[],
	heldSubmissions: [] as HeldSubmission[],
	submittedForms: [] as Array<{ action: string; fields: Record<string, string> }>,
	invalidateAll: vi.fn(async () => {})
}));

vi.mock('$lib/stores/toast.svelte', () => ({ toastStore: { success: vi.fn() } }));
vi.mock('$app/navigation', () => ({ invalidateAll }));

// Rank on/off changes post with fetch; the names editor posts through enhance. Both hold until the test answers.
vi.mock('$app/forms', () => ({
	deserialize: (text: string) => JSON.parse(text),
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
	vi.stubGlobal(
		'fetch',
		(url: string, init: { body: FormData }) =>
			new Promise((resolve) => {
				heldPosts.push({
					action: url,
					fields: [...init.body.entries()] as Array<[string, string]>,
					answer: async (result) => {
						resolve({ text: async () => JSON.stringify(result) });
						await vi.runAllTimersAsync();
					}
				});
			})
	);
});

afterEach(async () => {
	heldPosts.length = 0;
	heldSubmissions.length = 0;
	submittedForms.length = 0;
	invalidateAll.mockClear();
	vi.unstubAllGlobals();
	try {
		cleanup();
		// Dialog/menu unmount schedules body-style restoration. Run it while happy-dom still exists.
		await vi.runAllTimersAsync();
		expect(vi.getTimerCount()).toBe(0);
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
		commands: { canEdit: true, canRetire: true, canReactivate: false, canDelete: true, deleteDisabledReason: null },
		...overrides
	};
}

function army(
	code: string,
	label: string,
	category: 'officer' | 'warrant' | 'enlisted',
	payGrade: string,
	overrides: Partial<SettingsRankCatalogRow> = {}
): SettingsRankCatalogRow {
	return rankEntry({
		code,
		label,
		service: 'army',
		serviceLabel: 'Army',
		category,
		categoryLabel: { officer: 'Officer', warrant: 'Warrant Officer', enlisted: 'Enlisted' }[category],
		payGrade,
		payGradeLabel: payGrade,
		source: 'built-in',
		sourceLabel: 'Built-in',
		commands: { canEdit: false, canRetire: true, canReactivate: false, canDelete: false, deleteDisabledReason: null },
		...overrides
	});
}

function heldBy(people: number, entry: SettingsRankCatalogRow): SettingsRankCatalogRow {
	return {
		...entry,
		referenceSummary: {
			...entry.referenceSummary,
			activeReferences: { personnel: people, trainingApplicability: 0, total: people },
			canDelete: false
		}
	};
}

const off = (entry: SettingsRankCatalogRow): SettingsRankCatalogRow => ({ ...entry, state: 'retired' });

const LT = army('2LT', 'Second Lieutenant', 'officer', 'O-1');
const WO1 = army('WO1', 'Warrant Officer 1', 'warrant', 'W-1');
const CW2 = heldBy(3, army('CW2', 'Chief Warrant Officer 2', 'warrant', 'W-2'));
const CW3 = off(army('CW3', 'Chief Warrant Officer 3', 'warrant', 'W-3'));
const SGT = army('SGT', 'Sergeant', 'enlisted', 'E-5');

function navyPack(): SettingsRankServicePackOption {
	return {
		value: 'navy',
		label: 'Navy',
		builtInCount: 26,
		existingCount: 0,
		activeCount: 0,
		retiredCount: 0,
		missingCount: 26,
		isInstalled: false,
		canBulkRetire: false,
		canBulkReactivate: false
	};
}

function rankSettings(ranks: SettingsRankCatalogRow[], canManageCatalog = true): RanksSettingsData {
	return {
		sections: {
			ranks: {
				commands: { canManageCatalog, canAddServicePack: canManageCatalog, canAddCustomRank: canManageCatalog },
				copy: { payGradeHelp: 'Pay grade help.', tieBreakHelp: 'Tie-break help.' },
				servicePacks: [navyPack()],
				options: {
					services: [
						{ value: 'army', label: 'Army' },
						{ value: 'navy', label: 'Navy' },
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
				entries: {
					active: ranks.filter((entry) => entry.state === 'active'),
					retired: ranks.filter((entry) => entry.state === 'retired')
				}
			}
		}
	};
}

function renderRankPage(ranks: SettingsRankCatalogRow[], canManageCatalog = true) {
	const view = render(Page, {
		data: { ranksSettings: rankSettings(ranks, canManageCatalog) } as never,
		form: null,
		params: { orgId: 'org-1' }
	});
	const show = (next: SettingsRankCatalogRow[], form: { rankError?: string; success?: boolean } | null) =>
		view.rerender({ data: { ranksSettings: rankSettings(next) } as never, form, params: { orgId: 'org-1' } });
	return {
		/** The catalog SvelteKit loads after a successful write. */
		reload: async (next: SettingsRankCatalogRow[]) => {
			await show(next, null);
			await vi.runAllTimersAsync();
		},
		// What SvelteKit's update() does when the action succeeds: the catalog reloads and focus drops to the body.
		succeedWith: async (next: SettingsRankCatalogRow[], data: Record<string, unknown> = {}) => {
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
					await show(ranks, { rankError: message });
				}
			});
			await vi.runAllTimersAsync();
		}
	};
}

function chip(label: string): HTMLElement {
	return screen.getByRole('button', { name: label });
}

function block(heading: string): HTMLElement {
	return screen.getByRole('region', { name: heading });
}

async function click(element: HTMLElement) {
	await fireEvent.click(element);
	await vi.runAllTimersAsync();
}

describe('turning ranks on and off', () => {
	it('shows each branch with how many of its ranks are on', () => {
		renderRankPage([LT, WO1, CW2, CW3, SGT]);

		expect(screen.getByRole('tab', { name: /Army/ })).toHaveTextContent(/4 of 5 on/);
		expect(chip('Warrant Officer 1')).toHaveAttribute('aria-pressed', 'true');
		expect(chip('Chief Warrant Officer 3')).toHaveAttribute('aria-pressed', 'false');
	});

	it('turns a rank off at once and saves it as one change', async () => {
		const page = renderRankPage([LT, WO1, SGT]);

		await click(chip('Sergeant'));
		expect(chip('Sergeant')).toHaveAttribute('aria-pressed', 'false');
		expect(heldPosts.map(({ action, fields }) => ({ action, fields }))).toEqual([
			{ action: '?/setRankStates', fields: [['code', 'SGT'], ['state', 'retired']] }
		]);

		await heldPosts[0].answer({ type: 'success', data: { success: true, changedCount: 1 } });
		expect(invalidateAll).toHaveBeenCalled();
		expect(chip('Sergeant')).toHaveAttribute('aria-pressed', 'false');

		await page.reload([LT, WO1, off(SGT)]);
		expect(chip('Sergeant')).toHaveAttribute('aria-pressed', 'false');
	});

	it('puts the rank back and shows the server message when the change fails', async () => {
		renderRankPage([LT, WO1, SGT]);

		await click(chip('Sergeant'));
		await heldPosts[0].answer({ type: 'failure', status: 403, data: { rankError: 'Access denied.' } });

		expect(chip('Sergeant')).toHaveAttribute('aria-pressed', 'true');
		expect(within(block('Enlisted')).getByRole('alert')).toHaveTextContent('Access denied.');
	});

	it('keeps the last click on a rank when an earlier one fails', async () => {
		renderRankPage([LT, WO1, SGT]);

		await click(chip('Sergeant'));
		await click(chip('Sergeant'));
		await heldPosts[0].answer({ type: 'failure', status: 500 });

		expect(chip('Sergeant')).toHaveAttribute('aria-pressed', 'true');
		expect(heldPosts[1].fields).toEqual([
			['code', 'SGT'],
			['state', 'active']
		]);
	});

	it('names the people who keep a held rank that is turned off', async () => {
		renderRankPage([LT, WO1, CW2, SGT]);

		await click(chip('Chief Warrant Officer 2'));

		const note = within(block('Warrant Officer')).getByRole('status');
		expect(note).toHaveTextContent(/CW2/);
		expect(note).toHaveTextContent(/\b3 people\b/);
	});

	it('turns a whole category off in one write and Undo restores each rank as it was', async () => {
		renderRankPage([LT, WO1, CW2, CW3, SGT]);

		await click(screen.getByRole('button', { name: 'Turn all Warrant Officer ranks off' }));
		for (const label of ['Warrant Officer 1', 'Chief Warrant Officer 2', 'Chief Warrant Officer 3']) {
			expect(chip(label)).toHaveAttribute('aria-pressed', 'false');
		}
		expect(heldPosts[0].fields).toEqual([
			['code', 'CW2'],
			['state', 'retired'],
			['code', 'WO1'],
			['state', 'retired']
		]);
		const note = within(block('Warrant Officer')).getByRole('status');
		expect(note).toHaveTextContent(/CW2 \(3 people\)/);
		expect(note).not.toHaveTextContent(/WO1 \(/);
		await heldPosts[0].answer({ type: 'success', data: { success: true, changedCount: 2 } });

		await click(within(note).getByRole('button', { name: 'Undo' }));
		expect(heldPosts[1].fields).toEqual([
			['code', 'CW2'],
			['state', 'active'],
			['code', 'WO1'],
			['state', 'active']
		]);
		expect(chip('Warrant Officer 1')).toHaveAttribute('aria-pressed', 'true');
		expect(chip('Chief Warrant Officer 3')).toHaveAttribute('aria-pressed', 'false');
		expect(note).toBeEmptyDOMElement();
	});

	it('adds a branch and opens its tab', async () => {
		const page = renderRankPage([LT, SGT]);

		await fireEvent.pointerDown(screen.getByRole('button', { name: '+ Add a branch' }), { button: 0, pointerType: 'mouse' });
		await vi.runAllTimersAsync();
		await click(screen.getByRole('menuitem', { name: /Navy/ }));
		expect(heldPosts.map(({ action, fields }) => ({ action, fields }))).toEqual([
			{ action: '?/addServicePack', fields: [['service', 'navy']] }
		]);

		await heldPosts[0].answer({ type: 'success', data: { success: true } });
		await page.reload([
			LT,
			SGT,
			{ ...rankEntry({ code: 'PO3', label: 'Petty Officer Third Class' }), service: 'navy', serviceLabel: 'Navy', source: 'built-in' }
		]);
		expect(screen.getByRole('tab', { name: /Navy/ })).toHaveAttribute('aria-selected', 'true');
	});
});

describe('custom rank names', () => {
	async function openNames() {
		await click(screen.getByRole('button', { name: 'Edit names' }));
	}

	function nameButton(code: string): HTMLElement {
		return screen.getByRole('button', { name: new RegExp(`^${code} `) });
	}

	function submitWith(button: HTMLElement) {
		(button as HTMLButtonElement).focus();
		(button as HTMLButtonElement).form!.requestSubmit(button as HTMLButtonElement);
	}

	it('renames a custom rank in place and keeps Code fixed', async () => {
		const page = renderRankPage([SGT, rankEntry()]);

		await openNames();
		await click(nameButton('DET-SGT'));
		const editor = screen.getByRole('form', { name: 'Edit DET-SGT' });
		expect(document.activeElement).toBe(within(editor).getByLabelText('Label'));
		expect(within(editor).queryByLabelText('Code')).toBeNull();
		expect(within(editor).getByLabelText('Tie-break')).toHaveAccessibleDescription('Tie-break help.');

		await fireEvent.input(within(editor).getByLabelText('Label'), { target: { value: 'Detachment Lead' } });
		await fireEvent.change(within(editor).getByLabelText('Pay grade'), { target: { value: 'E-7' } });
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
					sortOrder: '500'
				}
			}
		]);

		await page.succeedWith([SGT, rankEntry({ label: 'Detachment Lead', payGrade: 'E-7', payGradeLabel: 'E-7' })]);
		expect(within(screen.getByRole('form', { name: 'Edit DET-SGT' })).getByLabelText('Label')).toHaveValue(
			'Detachment Lead'
		);

		await fireEvent.keyDown(screen.getByLabelText('Label'), { key: 'Escape' });
		await vi.runAllTimersAsync();
		expect(screen.queryByRole('form', { name: 'Edit DET-SGT' })).toBeNull();
		expect(document.activeElement).toBe(nameButton('DET-SGT'));
	});

	it('keeps the typed values and marks the field the server rejected', async () => {
		const page = renderRankPage([rankEntry()]);

		await openNames();
		await click(nameButton('DET-SGT'));
		await fireEvent.input(screen.getByLabelText('Label'), { target: { value: 'Detachment Lead' } });
		await fireEvent.input(screen.getByLabelText('Tie-break'), { target: { value: '' } });
		submitWith(screen.getByRole('button', { name: 'Save DET-SGT' }));
		await page.fail('Tie-break order must be a whole number.');

		const tieBreak = screen.getByLabelText('Tie-break');
		expect(tieBreak).toHaveAttribute('aria-invalid', 'true');
		expect(tieBreak).toHaveAccessibleDescription(expect.stringContaining('Tie-break order must be a whole number.'));
		expect(screen.getByLabelText('Label')).toHaveValue('Detachment Lead');
	});

	it('removes an unused custom rank after a destructive confirmation', async () => {
		const page = renderRankPage([rankEntry(), rankEntry({ code: 'OTHER', label: 'Other Sergeant' })]);

		await openNames();
		await click(nameButton('DET-SGT'));
		await click(screen.getByRole('button', { name: 'Remove' }));
		const dialog = screen.getByRole('alertdialog', { name: 'Remove DET-SGT' });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove rank' }));
		expect(submittedForms).toEqual([{ action: '?/deleteRank', fields: { code: 'DET-SGT' } }]);

		await page.succeedWith([rankEntry({ code: 'OTHER', label: 'Other Sergeant' })]);
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(screen.queryByRole('button', { name: /^DET-SGT / })).toBeNull();
	});

	it('adds a custom rank from a blank draft with Code focused', async () => {
		const page = renderRankPage([SGT]);

		await click(screen.getByRole('button', { name: '+ Custom rank' }));
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

		await page.succeedWith([SGT, rankEntry({ code: 'NEW-1', label: 'New rank' })], { code: 'NEW-1' });
		expect(screen.queryByLabelText('Code')).toBeNull();
		expect(chip('New rank')).toHaveAttribute('aria-pressed', 'true');
	});

	it('closes the draft on Escape and returns focus to + Custom rank', async () => {
		renderRankPage([SGT]);

		await click(screen.getByRole('button', { name: '+ Custom rank' }));
		await fireEvent.keyDown(screen.getByLabelText('Code'), { key: 'Escape' });
		await vi.runAllTimersAsync();

		expect(screen.queryByLabelText('Code')).toBeNull();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: '+ Custom rank' }));
	});
});

describe('view only', () => {
	it('shows every rank but offers no changes without governance access', () => {
		renderRankPage([SGT, rankEntry({ commands: { ...rankEntry().commands, canEdit: false } })], false);

		expect(chip('Sergeant')).toBeDisabled();
		expect(chip('Detachment Sergeant')).toBeDisabled();
		expect(screen.queryByRole('button', { name: /Turn all/ })).toBeNull();
		expect(screen.queryByRole('button', { name: '+ Custom rank' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Edit names' })).toBeNull();
		expect(screen.queryByRole('button', { name: '+ Add a branch' })).toBeNull();
	});
});
