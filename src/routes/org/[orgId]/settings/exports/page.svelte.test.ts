// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick, type ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

const downloads = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('../settingsDownloads', () => ({ downloadBlob: downloads.save }));

function data(orgId: string) {
	return { orgId } as ComponentProps<typeof Page>['data'];
}

function mount(orgId = 'organization-a') {
	return render(Page, { data: data(orgId), form: null, params: { orgId: 'slug-a' } });
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
	expect((screen.getByRole('button', { name: 'Export JSON' }) as HTMLButtonElement).disabled).toBe(false);
	expect((screen.getByRole('button', { name: 'Export Excel' }) as HTMLButtonElement).disabled).toBe(false);
}

function noFeedback() {
	expect(screen.queryByText('Export downloaded successfully.')).toBeNull();
	expect(screen.queryByText('Export failed. Please try again.')).toBeNull();
	expect(screen.queryByText('A export unavailable')).toBeNull();
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
});

describe('Organization export target lifetime', () => {
	it.each([
		['JSON', 'export', 'organization-a.json', 'organization-a.json'],
		['Excel', 'export-excel', undefined, 'org-export-organization-a.xlsx']
	] as const)(
		'keeps %s controls busy until the requested artifact downloads',
		async (label, endpoint, header, filename) => {
			const pending = deferred<Response>();
			const request = vi.fn(() => pending.promise);
			vi.stubGlobal('fetch', request);
			mount();
			await fireEvent.click(screen.getByRole('button', { name: `Export ${label}` }));
			expect(request).toHaveBeenCalledWith(`/org/organization-a/api/${endpoint}`, { method: 'POST' });
			expect((screen.getByRole('button', { name: /Generating/ }) as HTMLButtonElement).disabled).toBe(true);
			expect(
				(screen.getByRole('button', { name: label === 'JSON' ? 'Export Excel' : 'Export JSON' }) as HTMLButtonElement)
					.disabled
			).toBe(true);
			expect(downloads.save).not.toHaveBeenCalled();
			pending.resolve(success(header));
			await waitFor(() => expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), filename));
			expect(screen.getByText('Export downloaded successfully.')).toBeTruthy();
			idle();
		}
	);

	it('allows an explicit retry after a failed response without downloading its body', async () => {
		const request = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ error: 'A export unavailable' }, { status: 503 }))
			.mockResolvedValueOnce(success('retry.json'));
		vi.stubGlobal('fetch', request);
		mount();
		await fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
		await waitFor(() => expect(screen.getByText('A export unavailable')).toBeTruthy());
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
			expect(
				screen.getByText(status === 200 ? 'Export downloaded successfully.' : 'Export failed. Please try again.')
			).toBeTruthy()
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
		expect((screen.getByRole('button', { name: /Generating/ }) as HTMLButtonElement).disabled).toBe(true);
		noFeedback();
		b.resolve(new Response('organization-b artifact', { status: 200 }));
		await waitFor(() =>
			expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), 'org-export-organization-b.xlsx')
		);
		expect(await downloads.save.mock.calls[1][0].text()).toBe('organization-b artifact');
		idle();
		expect(screen.getByText('Export downloaded successfully.')).toBeTruthy();
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
		expect((screen.getByRole('button', { name: /Generating/ }) as HTMLButtonElement).disabled).toBe(true);
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
		expect(screen.getByRole('button', { name: /Generating/ })).toBeTruthy();
		pending.resolve(success());
		await waitFor(() =>
			expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), 'org-export-organization-a.json')
		);
		idle();
	});
});
