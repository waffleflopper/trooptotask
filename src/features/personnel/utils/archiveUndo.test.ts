import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endOrganizationLifetime } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';
import { archiveUndoAction, describeArchiveUndo, undoArchive, type ArchiveUndone } from './archiveUndo';

const { invalidateMock } = vi.hoisted(() => ({ invalidateMock: vi.fn() }));
vi.mock('$app/navigation', () => ({ invalidate: invalidateMock }));

const nothing: ArchiveUndone = { restoredIds: [], changedIds: [], withdrawnRequestIds: [], reviewedRequestIds: [] };
const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const spies = () => ({
	success: vi.spyOn(toastStore, 'success'),
	warning: vi.spyOn(toastStore, 'warning'),
	error: vi.spyOn(toastStore, 'error')
});

beforeEach(() => {
	fetchMock.mockReset();
	invalidateMock.mockReset().mockResolvedValue(undefined);
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('undoArchive', () => {
	it('sends the token and returns what was restored, withdrawn and left alone', async () => {
		const reply = { ...nothing, restoredIds: ['a'], changedIds: ['b'], withdrawnRequestIds: ['r'] };
		fetchMock.mockResolvedValueOnce(Response.json(reply));

		await expect(undoArchive('org-1', 'token-1')).resolves.toEqual(reply);
		expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
			['/org/org-1/api/personnel/archive-batch/undo', 'POST', JSON.stringify({ token: 'token-1' })]
		]);
	});

	it('rejects with the reason a refused request gives, and as unconfirmed for a lost or malformed reply', async () => {
		fetchMock.mockResolvedValueOnce(Response.json({ message: 'This Undo has expired.' }, { status: 410 }));
		await expect(undoArchive('org-1', 't')).rejects.toThrow('This Undo has expired.');

		fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
		await expect(undoArchive('org-1', 't')).rejects.toThrow('Undo could not be confirmed');

		fetchMock.mockResolvedValueOnce(Response.json({ restoredIds: ['a'] }));
		await expect(undoArchive('org-1', 't')).rejects.toThrow('Undo could not be confirmed');
	});
});

describe('describeArchiveUndo', () => {
	it('counts an Undo as done when it restored people or withdrew requests, and as nothing otherwise', () => {
		expect(describeArchiveUndo({ ...nothing, restoredIds: ['a'] }).undone).toBe(true);
		expect(describeArchiveUndo({ ...nothing, withdrawnRequestIds: ['r'] }).undone).toBe(true);
		expect(describeArchiveUndo({ ...nothing, changedIds: ['a'], reviewedRequestIds: ['r'] }).undone).toBe(false);
	});

	it('names what was left alone only when something was', () => {
		expect(describeArchiveUndo({ ...nothing, restoredIds: ['a'] }).description).toBeUndefined();
		expect(describeArchiveUndo({ ...nothing, restoredIds: ['a'], changedIds: ['b'] }).description).toEqual(
			expect.any(String)
		);
		expect(describeArchiveUndo({ ...nothing, reviewedRequestIds: ['r'] }).description).toEqual(expect.any(String));
	});
});

describe('archiveUndoAction', () => {
	it('restores, says so, and rereads the roster', async () => {
		fetchMock.mockResolvedValueOnce(Response.json({ ...nothing, restoredIds: ['a'] }));
		const { success, warning, error } = spies();

		archiveUndoAction('org-1', 'token-1', () => true).onClick();
		await vi.waitFor(() => expect(invalidateMock).toHaveBeenCalledExactlyOnceWith('app:personnel-data'));

		expect(success).toHaveBeenCalledTimes(1);
		expect(warning).not.toHaveBeenCalled();
		expect(error).not.toHaveBeenCalled();
	});

	it('warns instead, and rereads nothing, when everything changed since', async () => {
		fetchMock.mockResolvedValueOnce(Response.json({ ...nothing, changedIds: ['a'] }));
		const { success, warning } = spies();

		archiveUndoAction('org-1', 'token-1', () => true).onClick();
		await vi.waitFor(() => expect(warning).toHaveBeenCalledTimes(1));

		expect(success).not.toHaveBeenCalled();
		expect(invalidateMock).not.toHaveBeenCalled();
	});

	it('warns that the roster could not be refreshed when the reread fails', async () => {
		fetchMock.mockResolvedValueOnce(Response.json({ ...nothing, restoredIds: ['a'] }));
		invalidateMock.mockRejectedValueOnce(new Error('offline'));
		const { warning } = spies();

		archiveUndoAction('org-1', 'token-1', () => true).onClick();

		await vi.waitFor(() => expect(warning).toHaveBeenCalledTimes(1));
	});

	it('shows the reason when the request is refused', async () => {
		fetchMock.mockResolvedValueOnce(Response.json({ message: 'This Undo is not available.' }, { status: 403 }));
		const { error } = spies();

		archiveUndoAction('org-1', 'token-1', () => true).onClick();
		await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));

		expect(error.mock.calls[0][3]).toBe('This Undo is not available.');
		expect(invalidateMock).not.toHaveBeenCalled();
	});

	it('sends nothing and says nothing when pressed after the caller moved on', async () => {
		const { success, warning, error } = spies();

		archiveUndoAction('org-1', 'token-1', () => false).onClick();
		await flush();

		expect(fetchMock).not.toHaveBeenCalled();
		expect([success, warning, error].map((toast) => toast.mock.calls.length)).toEqual([0, 0, 0]);
	});

	it.each(['reply', 'failure'] as const)(
		'writes and says nothing when the caller moves on before the %s arrives',
		async (outcome) => {
			let current = true;
			let settle!: { resolve: (response: Response) => void; reject: (error: Error) => void };
			fetchMock.mockImplementationOnce(() => new Promise((resolve, reject) => (settle = { resolve, reject })));
			const { success, warning, error } = spies();

			archiveUndoAction('org-1', 'token-1', () => current).onClick();
			await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
			current = false;
			if (outcome === 'reply') settle.resolve(Response.json({ ...nothing, restoredIds: ['a'] }));
			else settle.reject(new Error('offline'));
			await flush();

			expect([success, warning, error].map((toast) => toast.mock.calls.length)).toEqual([0, 0, 0]);
			expect(invalidateMock).not.toHaveBeenCalled();
		}
	);

	it('writes and says nothing when the Organization ends while the request runs', async () => {
		let resolveFetch!: (response: Response) => void;
		fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveFetch = resolve)));
		const { success } = spies();

		archiveUndoAction('org-1', 'token-1', () => true).onClick();
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
		endOrganizationLifetime();
		resolveFetch(Response.json({ ...nothing, restoredIds: ['a'] }));
		await flush();

		expect(success).not.toHaveBeenCalled();
		expect(invalidateMock).not.toHaveBeenCalled();
	});
});
