// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImportFlow from './import-flow.svelte';
import { personnelColumns, personnelLane, type PersonnelChange } from './importFlow.test-support';
import type { ChunkReply, RowReview } from './types';
import { go, resetHistory } from './importFlowHistory.test-support.svelte';
import { beforeNavigate } from '$app/navigation';
import { toastStore } from '$lib/stores/toast.svelte';

vi.mock('$app/state', async () => ({ page: (await import('./importFlowHistory.test-support.svelte')).page }));
vi.mock('$app/navigation', async () => ({
	pushState: (await import('./importFlowHistory.test-support.svelte')).pushState,
	beforeNavigate: vi.fn(),
	goto: vi.fn()
}));
vi.mock('$lib/stores/toast.svelte', () => ({ toastStore: { info: vi.fn() } }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

beforeEach(() => {
	resetHistory();
	vi.spyOn(window.history, 'go').mockImplementation((delta = 0) => go(delta));
	vi.spyOn(window.history, 'back').mockImplementation(() => go(-1));
});
const Flow = ImportFlow<typeof personnelColumns, ReturnType<typeof personnelLane>['references'], PersonnelChange>;

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function currentStep(): number {
	return [...document.querySelectorAll('ol[aria-label] > li')].findIndex((item) => item.hasAttribute('aria-current'));
}

async function upload(rows: string[], header = 'Last name,First name,Rank,ETS') {
	const zone = document.querySelector<HTMLElement>('[data-slot="dropzone"]')!;
	const file = new File([[header, ...rows].join('\n')], 'roster.csv');
	await fireEvent.drop(zone, { dataTransfer: { files: [file], types: ['Files'] } });
	await waitFor(() => expect(currentStep()).toBe(1));
}

async function toReview(rows: string[], header?: string) {
	await upload(rows, header);
	await fireEvent.click(screen.getByRole('button', { name: /^Review/ }));
	await waitFor(() => expect(currentStep()).toBe(2));
}

function importButton(): HTMLButtonElement {
	return screen.getByRole('button', { name: /^Import \d/ });
}

describe('ImportFlow', () => {
	it('steps back through Review, Columns and File with browser history and keeps the file', async () => {
		render(Flow, { lane: personnelLane(), title: 'Import', eyebrow: 'Test' });
		await toReview(['Smith,Alex,SGT,']);

		go(-1);
		await waitFor(() => expect(currentStep()).toBe(1));
		go(-1);
		await waitFor(() => expect(currentStep()).toBe(0));
		go(1);
		await waitFor(() => expect(currentStep()).toBe(1));
		expect(screen.getByRole('button', { name: /^Review/ })).toHaveProperty('disabled', false);
	});

	it('keeps Import disabled while a row waits for a fix and enables it once the rail answers', async () => {
		render(Flow, { lane: personnelLane(), title: 'Import', eyebrow: 'Test' });
		await toReview(['Smith,Alex,Sgt.,', 'Jones,Pat,Sgt.,']);
		expect(importButton().disabled).toBe(true);

		await fireEvent.click(screen.getByRole('radio', { name: 'SGT' }));
		await fireEvent.click(screen.getByRole('button', { name: /^Apply/ }));

		await waitFor(() => expect(importButton().disabled).toBe(false));
	});

	it('creates a missing value from the rail and applies it to the waiting rows', async () => {
		const base = personnelLane();
		const option = { id: 'SSG', label: 'SSG', value: 'SSG' };
		const created: string[] = [];
		const withOption = {
			...base,
			references: { rank: { ...base.references.rank, options: [...base.references.rank.options, option] } }
		};
		const lane = {
			...base,
			references: {
				rank: {
					...base.references.rank,
					create: async (name: string) => {
						created.push(name);
						await view.rerender({ lane: withOption });
						return { kind: 'created' as const, option };
					}
				}
			}
		};
		const view = render(Flow, { lane, title: 'Import', eyebrow: 'Test' });
		await toReview(['Smith,Alex,Staff Sgt,']);

		await fireEvent.click(screen.getByRole('button', { name: /^Create/ }));
		const name = screen.getByRole('textbox', { name: /name/i });
		await fireEvent.input(name, { target: { value: 'SSG' } });
		await fireEvent.submit(name.closest('form')!);

		expect(created).toEqual(['SSG']);
		await waitFor(() => expect(importButton().disabled).toBe(false));
	});

	it('commits an inline edit on Enter or blur, reverts it on Escape and moves focus to the next problem', async () => {
		render(Flow, { lane: personnelLane(), title: 'Import', eyebrow: 'Test' });
		await toReview(['Smith,Alex,SGT,someday', 'Jones,Pat,SGT,never']);
		const invalid = () => [...document.querySelectorAll<HTMLInputElement>('input[aria-invalid="true"]')];
		expect(invalid()).toHaveLength(2);

		const [first, next] = invalid();
		first.focus();
		await fireEvent.input(first, { target: { value: '2027-05-01' } });
		await fireEvent.keyDown(first, { key: 'Escape' });
		expect(first.value).toBe('someday');
		await fireEvent.input(first, { target: { value: '2027-05-01' } });
		await fireEvent.keyDown(first, { key: 'Enter' });
		await waitFor(() => expect(invalid()).toHaveLength(1));
		expect(document.activeElement).toBe(next);

		const [second] = invalid();
		await fireEvent.input(second, { target: { value: '2027-06-01' } });
		await fireEvent.blur(second);
		await waitFor(() => expect(invalid()).toHaveLength(0));
		expect(importButton().disabled).toBe(false);
	});

	it('names each review row by the lane identity so the person stays readable', async () => {
		render(Flow, { lane: personnelLane(), title: 'Import', eyebrow: 'Test' });
		await toReview(['Smith,Alex,SGT,', 'Jones,Pat,Sgt.,']);

		expect(screen.getByRole('rowheader', { name: /Smith, Alex/ })).toBeTruthy();
		expect(screen.getByRole('rowheader', { name: /Jones, Pat/ })).toBeTruthy();
	});

	it('shows the date that will be saved instead of the spreadsheet text', async () => {
		render(Flow, { lane: personnelLane(), title: 'Import', eyebrow: 'Test' });
		await toReview(['Smith,Alex,SGT,15MAR28']);

		expect(screen.getByText('2028-03-15')).toBeTruthy();
		expect(screen.queryByText('15MAR28')).toBeNull();
	});

	it('offers an editor for a field a row needs even when no column was mapped to it', async () => {
		const base = personnelLane();
		const lane = {
			...base,
			columns: { ...base.columns, rank: { ...base.columns.rank, required: false } },
			references: {},
			review: ({ values }: { values: Record<string, unknown> }): RowReview<PersonnelChange> =>
				values.rank
					? { outcome: 'new', key: String(values.lastName), change: {} as PersonnelChange }
					: { outcome: 'fix', problems: [{ field: 'rank', message: 'Rank is needed.' }] }
		} as unknown as ReturnType<typeof personnelLane>;
		render(Flow, { lane, title: 'Import', eyebrow: 'Test' });
		await toReview(['Smith,Alex'], 'Last name,First name');
		expect(importButton().disabled).toBe(true);

		const rank = screen.getByRole('textbox', { name: /^Rank/ });
		await fireEvent.input(rank, { target: { value: 'SGT' } });
		await fireEvent.keyDown(rank, { key: 'Enter' });

		await waitFor(() => expect(importButton().disabled).toBe(false));
	});

	it('sends a row skipped from the fix rail back to that rail question instead of a dead Undo', async () => {
		render(Flow, { lane: personnelLane(), title: 'Import', eyebrow: 'Test' });
		await toReview(['Smith,Alex,Sgt.,', 'Jones,Pat,Sgt.,', 'Lee,Kim,SGT,']);
		await fireEvent.click(screen.getByRole('button', { name: 'Skip 2 rows' }));

		expect(screen.queryAllByRole('button', { name: /^Undo skip/ })).toHaveLength(0);
		await fireEvent.click(screen.getByRole('button', { name: /Smith, Alex.*fix rail/ }));
		await waitFor(() => expect((document.activeElement as HTMLElement | null)?.textContent).toContain('Unknown rank'));

		await fireEvent.click(screen.getByRole('button', { name: /Skip Lee, Kim/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Undo skip Lee, Kim/ }));
		await waitFor(() => expect(screen.queryByRole('button', { name: /Undo skip Lee, Kim/ })).toBeNull());
	});

	it('reports every distinct outcome on Done, including rows the server did not confirm', async () => {
		const lane = {
			...personnelLane(),
			commitChunk: async (): Promise<ChunkReply> => ({ kind: 'unconfirmed' })
		};
		render(Flow, { lane, title: 'Import', eyebrow: 'Test' });
		await toReview(['Smith,Alex,SGT,', 'Jones,Pat,SGT,', 'Existing,Kim,SGT,', 'Lee,Sam,Sgt.,']);
		await fireEvent.click(screen.getByRole('button', { name: 'Skip 1 row' }));
		await fireEvent.click(importButton());

		const metric = async (label: string) =>
			(await screen.findByText(label)).closest('[data-slot="fact-metric"]')?.textContent;
		expect(await metric('Not confirmed')).toContain('2');
		expect(await metric('Unchanged')).toContain('1');
		expect(await metric('Skipped')).toContain('1');
		expect(screen.queryByText('Added')).toBeNull();
	});

	it('lists a long option set in a searchable box with the suggested option first', async () => {
		const base = personnelLane();
		const ranks = ['PVT', 'PV2', 'PFC', 'SPC', 'CPL', 'SSG', 'SFC', 'SGT'];
		const options = ranks.map((rank) => ({ id: rank, label: rank, value: rank }));
		const lane = {
			...base,
			references: {
				rank: {
					...base.references.rank,
					options,
					find: (key: string) => {
						const option = options.find((item) => item.id.toLowerCase() === key);
						if (option) return { kind: 'one' as const, option };
						return key === 'sgt.' ? { kind: 'none' as const, suggestion: options[7] } : { kind: 'none' as const };
					}
				}
			}
		};
		render(Flow, { lane, title: 'Import', eyebrow: 'Test' });
		await toReview(['Smith,Alex,Sgt.,']);

		expect(screen.queryAllByRole('radio', { name: 'PVT' })).toHaveLength(0);
		await fireEvent.click(screen.getByRole('button', { name: /^Read Sgt\. as/ }));
		const listbox = await screen.findByRole('listbox');
		expect(within(listbox).getAllByRole('option')[0].textContent).toContain('SGT');
	});

	it('shows the option a spreadsheet value resolved to instead of the spreadsheet text', async () => {
		const base = personnelLane();
		const lane = {
			...base,
			references: {
				rank: {
					...base.references.rank,
					find: (key: string) => {
						const option = base.references.rank.options[key === 'sgt.' ? 0 : 1];
						return { kind: 'one' as const, option };
					}
				}
			}
		};
		render(Flow, { lane, title: 'Import', eyebrow: 'Test' });
		await toReview(['Smith,Alex,Sgt.,']);

		expect(screen.getByText('SGT')).toBeTruthy();
		expect(screen.queryByText('Sgt.')).toBeNull();
	});

	it('keeps the spreadsheet text visible while its reference still needs a fix', async () => {
		render(Flow, { lane: personnelLane(), title: 'Import', eyebrow: 'Test' });
		await toReview(['Smith,Alex,Sgt.,']);

		expect(screen.getByDisplayValue('Sgt.')).toBeTruthy();
	});

	it('tells the user why leaving is blocked while a commit is saving, and keeps saving', async () => {
		const lane = { ...personnelLane(), commitChunk: () => new Promise<ChunkReply>(() => {}) };
		render(Flow, { lane, title: 'Import', eyebrow: 'Test' });
		await toReview(['Smith,Alex,SGT,']);
		await fireEvent.click(importButton());
		await screen.findByText(/^Saving/);

		const guard = vi.mocked(beforeNavigate).mock.calls.at(-1)![0];
		const cancel = vi.fn();
		guard({ cancel, willUnload: false, to: { url: new URL('http://localhost/org/other') }, type: 'link' } as never);

		expect(cancel).toHaveBeenCalled();
		expect(toastStore.info).toHaveBeenCalledOnce();
		expect(screen.getByText(/^Saving/)).toBeTruthy();
	});
});
