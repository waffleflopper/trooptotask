// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick, type ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

const downloads = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('$lib/utils/downloadBlob', () => ({ downloadBlob: downloads.save }));
const navigation = vi.hoisted(() => ({ invalidate: vi.fn(() => Promise.resolve()) }));
vi.mock('$app/navigation', () => ({ invalidate: navigation.invalidate }));

type PageData = ComponentProps<typeof Page>['data'];
type Settings = PageData['exportsSettings'];
type LastExport = PageData['lastExport'];

const COUNTS = { activePersonnel: 22, trainingRecords: 912 };

function data(orgId: string, settings: Partial<Settings> = {}, lastExport: LastExport = null) {
	return {
		orgId,
		orgName: 'C Co',
		orgUrlSegment: orgId,
		exportsSettings: { scopeCounts: Promise.resolve(COUNTS), ...settings },
		lastExport
	} as PageData;
}

function mount(orgId = 'organization-a', settings: Partial<Settings> = {}, lastExport: LastExport = null) {
	return render(Page, { data: data(orgId, settings, lastExport), form: null, params: { orgId: 'slug-a' } });
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function idle() {
	for (const name of ['Export JSON', 'Export Excel']) {
		expect(screen.getByRole('button', { name }).hasAttribute('aria-disabled')).toBe(false);
	}
}

function noFeedback() {
	expect(screen.queryByRole('alert')).toBeNull();
	expect(screen.getByRole('status').textContent).not.toMatch(/downloaded|failed|unavailable/);
}

function success(filename?: string) {
	return new Response('organization-a artifact', {
		status: 200,
		headers: filename ? { 'Content-Disposition': `attachment; filename="${filename}"` } : undefined
	});
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	vi.useRealTimers();
});

describe('Exports page', () => {
	it('writes the export scope with the unit counts', async () => {
		mount();

		const scope = await screen.findByRole('list', { name: 'What an export of C Co contains' });
		expect(
			within(scope)
				.getAllByRole('listitem')
				.map((chip) => chip.textContent?.trim())
		).toEqual(['Calendar', 'Personnel · 22', 'Training · 912 records', 'Onboarding', 'Sign-in rosters']);
	});

	it('shows owners the last export from the audit log', async () => {
		const at = new Date(2026, 9, 12, 9, 14).toISOString();
		mount('organization-a', {}, Promise.resolve({ format: 'excel', at, actor: 'whitaker@example.com' }));

		expect(await screen.findByText('Last export · Excel · 12 Oct 2026, 09:14 by whitaker@example.com')).toBeTruthy();
	});

	it('shows no last export line to an admin the server gave none', async () => {
		mount();
		await screen.findByRole('list', { name: 'What an export of C Co contains' });

		expect(screen.queryByText(/Last export/)).toBeNull();
	});

	it('explains a failed count and keeps both exports usable', async () => {
		mount('organization-a', { scopeCounts: Promise.reject(new Error('count failed')) });

		expect(await screen.findByText('Records could not be counted.')).toBeTruthy();
		expect(
			within(screen.getByRole('list', { name: 'What an export of C Co contains' }))
				.getAllByRole('listitem')
				.map((chip) => chip.textContent?.trim())
		).toEqual(['Calendar', 'Personnel', 'Training', 'Onboarding', 'Sign-in rosters']);
		idle();
	});

	describe('last export line after a download', () => {
		const earlier = new Date(2026, 9, 12, 9, 14).toISOString();
		const newest = new Date(2026, 9, 20, 14, 5).toISOString();

		it('keeps the audit value until the server answers, then shows the server answer', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success('fresh.json')));
			const view = mount(
				'organization-a',
				{},
				Promise.resolve({ format: 'excel', at: earlier, actor: 'x@example.com' })
			);
			expect(await screen.findByText('Last export · Excel · 12 Oct 2026, 09:14 by x@example.com')).toBeTruthy();

			await fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
			await waitFor(() => expect(downloads.save).toHaveBeenCalledOnce());

			expect(navigation.invalidate).toHaveBeenCalledExactlyOnceWith('app:settings-last-export');
			expect(screen.queryByText(/ by you/)).toBeNull();
			expect(screen.getByText('Last export · Excel · 12 Oct 2026, 09:14 by x@example.com')).toBeTruthy();

			const reread = deferred<Awaited<LastExport>>();
			await view.rerender({ data: data('organization-a', {}, reread.promise) });
			expect(screen.getByText('Loading the last export')).toBeTruthy();
			expect(screen.queryByText(/Last export ·/)).toBeNull();

			reread.resolve({ format: 'json', at: newest, actor: 'whitaker@example.com' });
			expect(await screen.findByText('Last export · JSON · 20 Oct 2026, 14:05 by whitaker@example.com')).toBeTruthy();
		});
	});

	it('keeps JSON and Excel distinguishable by accessible name while both exports run', async () => {
		const json = deferred<Response>();
		const excel = deferred<Response>();
		const request = vi.fn((url: string) => (url.endsWith('/export') ? json.promise : excel.promise));
		vi.stubGlobal('fetch', request);
		mount();

		await fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
		const excelButton = screen.getByRole('button', { name: 'Export Excel' });
		expect(excelButton.hasAttribute('aria-disabled')).toBe(false);
		await fireEvent.click(excelButton);

		expect(request.mock.calls.map(([url]) => url)).toEqual([
			'/org/organization-a/api/export',
			'/org/organization-a/api/export-excel'
		]);
		expect(screen.getByRole('button', { name: 'Generating JSON export…' }).getAttribute('aria-disabled')).toBe('true');
		expect(screen.getByRole('button', { name: 'Generating Excel export…' }).getAttribute('aria-disabled')).toBe('true');

		excel.resolve(success('unit.xlsx'));
		await waitFor(() => expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), 'unit.xlsx'));
		expect(screen.getByRole('button', { name: 'Export Excel' }).hasAttribute('aria-disabled')).toBe(false);
		expect(screen.getByRole('button', { name: 'Generating JSON export…' }).getAttribute('aria-disabled')).toBe('true');

		json.resolve(success('unit.json'));
		await waitFor(() => expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), 'unit.json'));
		idle();
	});
});

describe('Organization export target lifetime', () => {
	it.each([
		['JSON', 'export', 'organization-a.json', 'organization-a.json'],
		['Excel', 'export-excel', undefined, 'org-export-organization-a.xlsx']
	] as const)(
		'keeps the %s button busy until the requested artifact downloads',
		async (label, endpoint, header, filename) => {
			const pending = deferred<Response>();
			const request = vi.fn(() => pending.promise);
			vi.stubGlobal('fetch', request);
			mount();
			await fireEvent.click(screen.getByRole('button', { name: `Export ${label}` }));
			expect(request).toHaveBeenCalledWith(`/org/organization-a/api/${endpoint}`, { method: 'POST' });
			expect(screen.getByRole('button', { name: `Generating ${label} export…` }).getAttribute('aria-disabled')).toBe(
				'true'
			);
			expect(screen.getByRole('status').textContent).toBe(`Generating ${label} export...`);
			expect(downloads.save).not.toHaveBeenCalled();
			pending.resolve(success(header));
			await waitFor(() => expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), filename));
			expect(screen.getByRole('status').textContent).toBe(`${label} export downloaded.`);
			idle();
		}
	);

	it('keeps focus on the pressed export while it is busy and ignores repeat presses', async () => {
		const pending = deferred<Response>();
		const request = vi.fn(() => pending.promise);
		vi.stubGlobal('fetch', request);
		mount();
		const button = screen.getByRole('button', { name: 'Export JSON' });
		button.focus();
		await fireEvent.click(button);
		expect(document.activeElement).toBe(button);
		expect((button as HTMLButtonElement).disabled).toBe(false);
		expect(button.getAttribute('aria-disabled')).toBe('true');
		await fireEvent.click(button);
		expect(request).toHaveBeenCalledOnce();
		pending.resolve(success());
		await waitFor(() => expect(downloads.save).toHaveBeenCalledOnce());
		expect(document.activeElement).toBe(button);
	});

	it('allows an explicit retry after a failed response without downloading its body', async () => {
		const request = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ error: 'A export unavailable' }, { status: 503 }))
			.mockResolvedValueOnce(success('retry.json'));
		vi.stubGlobal('fetch', request);
		mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
		await waitFor(() => expect(screen.getByRole('alert').textContent?.trim()).toBe('A export unavailable'));
		expect(downloads.save).not.toHaveBeenCalled();
		idle();
		await fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
		await waitFor(() => expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), 'retry.json'));
		expect(screen.queryByText('A export unavailable')).toBeNull();
		idle();
	});

	it.each([200, 503])('discards completed A feedback when B becomes current (%i)', async (status) => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(status === 200 ? success() : new Response(null, { status })));
		const view = mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
		await waitFor(() =>
			expect(screen.getByRole('status').textContent).toBe(
				status === 200 ? 'JSON export downloaded.' : 'JSON export failed. Please try again.'
			)
		);
		await view.rerender({ data: data('organization-b') });
		idle();
		noFeedback();
	});

	it('lets held A download finish while B keeps its own pending export and feedback', async () => {
		const a = deferred<Response>();
		const b = deferred<Response>();
		vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise));
		const view = mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
		await view.rerender({ data: data('organization-b') });
		idle();
		noFeedback();
		await fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));
		a.resolve(success('requested-a.json'));
		await waitFor(() => expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), 'requested-a.json'));
		expect(await downloads.save.mock.calls[0][0].text()).toBe('organization-a artifact');
		expect(screen.getByRole('button', { name: 'Generating Excel export…' }).getAttribute('aria-disabled')).toBe('true');
		noFeedback();
		b.resolve(new Response('organization-b artifact', { status: 200 }));
		await waitFor(() =>
			expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), 'org-export-organization-b.xlsx')
		);
		expect(await downloads.save.mock.calls[1][0].text()).toBe('organization-b artifact');
		idle();
		expect(screen.getByRole('status').textContent).toBe('Excel export downloaded.');
	});

	it('keeps a new A export pending when the disposed A request finishes after A → B → A', async () => {
		const old = deferred<Response>();
		const current = deferred<Response>();
		vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise));
		const view = mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
		await view.rerender({ data: data('organization-b') });
		await view.rerender({ data: data('organization-a') });
		await fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));
		old.resolve(success('old-a.json'));
		await waitFor(() => expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), 'old-a.json'));
		expect(screen.getByRole('button', { name: 'Generating Excel export…' }).getAttribute('aria-disabled')).toBe('true');
		noFeedback();
		current.resolve(success('current-a.xlsx'));
		await waitFor(() => expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), 'current-a.xlsx'));
		idle();
	});

	it.each(['response', 'transport'] as const)('discards a late A %s failure after switching to B', async (kind) => {
		const pending = deferred<Response>();
		vi.stubGlobal(
			'fetch',
			vi.fn(() => pending.promise)
		);
		const view = mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
		await view.rerender({ data: data('organization-b') });
		if (kind === 'response') pending.resolve(new Response(null, { status: 503 }));
		else pending.reject(new Error('Transport unavailable'));
		await pending.promise.catch(() => undefined);
		await tick();
		idle();
		noFeedback();
		expect(downloads.save).not.toHaveBeenCalled();
	});

	it.each(['artifact', 'error'] as const)(
		'isolates late %s body completion while preserving the requested download',
		async (kind) => {
			const body = deferred<Blob | { error: string }>();
			const read = vi.fn(() => body.promise);
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({
					ok: kind === 'artifact',
					headers: new Headers(kind === 'error' ? { 'Content-Type': 'application/json' } : {}),
					blob: read,
					json: read
				})
			);
			const view = mount();
			await fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
			await waitFor(() => expect(read).toHaveBeenCalledOnce());
			await view.rerender({ data: data('organization-b') });
			body.resolve(kind === 'artifact' ? new Blob(['A']) : { error: 'A export unavailable' });
			await body.promise;
			await tick();
			idle();
			noFeedback();
			if (kind === 'artifact')
				expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), 'org-export-organization-a.json');
			else expect(downloads.save).not.toHaveBeenCalled();
		}
	);

	it('retains a pending export when only the same canonical Organization URL changes', async () => {
		const pending = deferred<Response>();
		vi.stubGlobal(
			'fetch',
			vi.fn(() => pending.promise)
		);
		const view = mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
		await view.rerender({ data: data('organization-a'), params: { orgId: 'new-slug-a' } });
		expect(screen.getByRole('button', { name: 'Generating JSON export…' })).toBeTruthy();
		pending.resolve(success());
		await waitFor(() =>
			expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), 'org-export-organization-a.json')
		);
		idle();
	});
});
