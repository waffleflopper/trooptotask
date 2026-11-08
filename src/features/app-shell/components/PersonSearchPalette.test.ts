// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import PersonSearchPalette from './PersonSearchPalette.svelte';
import {
	go,
	historyLength,
	navigations,
	page,
	pushState,
	resetHistory
} from '../personSearchHistory.test-support.svelte';
import type { PersonSearchEntry } from '$features/personnel/contracts';

vi.mock('$app/state', async () => ({
	page: (await import('../personSearchHistory.test-support.svelte')).page
}));
vi.mock('$app/navigation', async () => {
	const history = await import('../personSearchHistory.test-support.svelte');
	return { goto: history.goto, pushState: history.pushState };
});

function person(id: string, rank: string, lastName: string, firstName: string, groupName: string | null = 'Alpha') {
	return { id, slug: `${lastName}-${firstName}`.toLowerCase(), rank, firstName, lastName, groupName };
}

const roster: PersonSearchEntry[] = [
	person('p1', 'SGT', 'Smith', 'John'),
	person('p2', 'SPC', 'Smith', 'Jane', 'Bravo'),
	person('p3', 'SSG', 'Adams', 'Casey', null)
];

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

function indexResponse(people: PersonSearchEntry[], ok = true) {
	return { ok, json: async () => ({ people }) } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn(async () => indexResponse(roster));
	vi.stubGlobal('fetch', fetchMock);
	vi.spyOn(history, 'back').mockImplementation(() => go(-1));
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	resetHistory();
});

function renderPalette(props: { orgId?: string; orgUrlSegment?: string } = {}) {
	return render(PersonSearchPalette, { props: { orgId: 'org-1', orgUrlSegment: 'alpha', ...props } });
}

async function openPalette() {
	await act(() => pushState('', { personSearch: true }));
}

function settle() {
	return act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

function optionNames() {
	return screen.queryAllByRole('option').map((option) => option.textContent?.trim());
}

describe('person search palette', () => {
	it('shows a loading state until the people arrive, then lists them', async () => {
		const pending = deferred<Response>();
		fetchMock.mockReturnValueOnce(pending.promise);
		renderPalette();
		await openPalette();

		expect(await screen.findByTestId('person-search-loading')).toBeInTheDocument();
		expect(screen.queryAllByRole('option')).toHaveLength(0);

		await act(() => pending.resolve(indexResponse(roster)));

		expect(await screen.findByRole('option', { name: /SGT Smith, John/ })).toBeVisible();
		expect(screen.queryByTestId('person-search-loading')).toBeNull();
	});

	it.each([
		['SGT Smith', ['SGT Smith, John']],
		['Smith John', ['SGT Smith, John']],
		['smith, jane', ['SPC Smith, Jane']],
		['bravo', ['SPC Smith, Jane']],
		['smith', ['SGT Smith, John', 'SPC Smith, Jane']]
	])('narrows to the people matching "%s"', async (query, expected) => {
		renderPalette();
		await openPalette();
		const input = await screen.findByRole('combobox');
		await screen.findByRole('option', { name: /Adams/ });

		await fireEvent.input(input, { target: { value: query } });

		await waitFor(() => expect(optionNames().map((name) => name?.replace(/\s*(Alpha|Bravo)$/, ''))).toEqual(expected));
	});

	it('says so when nobody matches', async () => {
		renderPalette();
		await openPalette();
		await fireEvent.input(await screen.findByRole('combobox'), { target: { value: 'smith zzz' } });

		await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No people found.'));
		expect(screen.queryAllByRole('option')).toHaveLength(0);
	});

	it('lists at most twenty matches', async () => {
		const many = Array.from({ length: 45 }, (_, i) =>
			person(`m${i}`, 'SPC', `Lee${String(i).padStart(2, '0')}`, 'Sam')
		);
		fetchMock.mockResolvedValue(indexResponse(many));
		renderPalette();
		await openPalette();

		await screen.findByRole('option', { name: /Lee00/ });

		expect(screen.getAllByRole('option')).toHaveLength(20);
		await fireEvent.input(screen.getByRole('combobox'), { target: { value: 'lee44' } });
		await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
	});

	it('shows a load error with a retry that recovers, without refetching on its own', async () => {
		fetchMock.mockResolvedValueOnce(indexResponse([], false));
		renderPalette();
		await openPalette();

		const alert = await screen.findByRole('alert');
		expect(fetchMock).toHaveBeenCalledTimes(1);

		await fireEvent.click(within(alert).getByRole('button'));

		expect(await screen.findByRole('option', { name: /SGT Smith, John/ })).toBeVisible();
		expect(screen.queryByRole('alert')).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('treats a malformed body as a load error', async () => {
		fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ people: 'nope' }) } as Response);
		renderPalette();
		await openPalette();

		expect(await screen.findByRole('alert')).toBeVisible();
	});

	it('drops a response that arrives after the Organization changed', async () => {
		const oldOrg = deferred<Response>();
		const newOrg = deferred<Response>();
		fetchMock.mockReturnValueOnce(oldOrg.promise).mockReturnValueOnce(newOrg.promise);
		const view = renderPalette();
		await openPalette();
		await screen.findByTestId('person-search-loading');

		await view.rerender({ orgId: 'org-2', orgUrlSegment: 'bravo' });
		await act(() => newOrg.resolve(indexResponse([person('new', 'CPT', 'Current', 'Cal')])));
		await screen.findByRole('option', { name: /CPT Current, Cal/ });
		await act(() => oldOrg.resolve(indexResponse([person('old', 'COL', 'Retired', 'Rita')])));
		await settle();

		expect(screen.getByRole('option', { name: /CPT Current, Cal/ })).toBeVisible();
		expect(screen.queryByRole('option', { name: /Retired/ })).toBeNull();
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/org/alpha/api/personnel', '/org/bravo/api/personnel']);
	});

	it('does not show the previous Organization people while the next ones load', async () => {
		const view = renderPalette();
		await openPalette();
		await screen.findByRole('option', { name: /SGT Smith, John/ });

		const next = deferred<Response>();
		fetchMock.mockReturnValueOnce(next.promise);
		await view.rerender({ orgId: 'org-2', orgUrlSegment: 'bravo' });

		expect(await screen.findByTestId('person-search-loading')).toBeInTheDocument();
		expect(screen.queryByRole('option', { name: /Smith/ })).toBeNull();
	});

	it('drops a response that arrives after the palette closed and shows nothing stale on reopen', async () => {
		const first = deferred<Response>();
		const second = deferred<Response>();
		fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		renderPalette();
		await openPalette();
		await screen.findByTestId('person-search-loading');

		await act(() => go(-1));
		await act(() => first.resolve(indexResponse(roster)));
		await settle();
		await openPalette();

		expect(await screen.findByTestId('person-search-loading')).toBeInTheDocument();
		expect(screen.queryByRole('option')).toBeNull();
		await act(() => second.resolve(indexResponse([person('p9', 'LTC', 'Fresh', 'Fran')])));
		expect(await screen.findByRole('option', { name: /LTC Fresh, Fran/ })).toBeVisible();
	});

	it('shows the people it already has on reopen while it refreshes them', async () => {
		renderPalette();
		await openPalette();
		await screen.findByRole('option', { name: /SGT Smith, John/ });
		await act(() => go(-1));

		const refresh = deferred<Response>();
		fetchMock.mockReturnValueOnce(refresh.promise);
		await openPalette();

		expect(await screen.findByRole('option', { name: /SGT Smith, John/ })).toBeVisible();
		await act(() => refresh.resolve(indexResponse([person('p9', 'LTC', 'Fresh', 'Fran')])));
		expect(await screen.findByRole('option', { name: /LTC Fresh, Fran/ })).toBeVisible();
		expect(screen.queryByRole('option', { name: /Smith/ })).toBeNull();
	});

	it('closes the palette before opening the chosen record, so Back from the record skips the palette', async () => {
		renderPalette();
		await openPalette();
		expect(historyLength()).toBe(2);

		await fireEvent.click(await screen.findByRole('option', { name: /SGT Smith, John/ }));

		await waitFor(() =>
			expect(navigations).toEqual([{ href: '/org/alpha/personnel/smith-john', replaceState: undefined }])
		);
		expect(historyLength()).toBe(2);
		await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
		await act(() => go(-1));
		expect(page.state.personSearch).toBeUndefined();
		expect(screen.queryByRole('combobox')).toBeNull();
	});

	it('closes on Escape by stepping back over its history entry', async () => {
		renderPalette();
		await openPalette();

		await fireEvent.keyDown(await screen.findByRole('combobox'), { key: 'Escape' });

		await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
		expect(page.state.personSearch).toBeUndefined();
	});

	it('closes when the browser goes Back', async () => {
		renderPalette();
		await openPalette();
		await screen.findByRole('combobox');

		await act(() => go(-1));

		await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
	});

	it('toggles with Ctrl+K and clears the search for the next open', async () => {
		renderPalette();
		await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
		const input = await screen.findByRole('combobox');
		await fireEvent.input(input, { target: { value: 'adams' } });

		await fireEvent.keyDown(window, { key: 'K', metaKey: true });
		await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
		await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

		expect(await screen.findByRole('combobox')).toHaveValue('');
	});
});
