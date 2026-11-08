import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from '$lib/stores/toast.svelte';
import { endOrganizationLifetime } from '$lib/stores/core';
import { settles } from '$lib/test-support/settles';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { archivePersonnel } from './archivePersonnel';
import type { Personnel } from '../personnel.types';

const { appPage, invalidateMock } = vi.hoisted(() => ({
	appPage: { url: new URL('http://localhost/org/org-alpha/personnel/able-avery') },
	invalidateMock: vi.fn()
}));
vi.mock('$app/state', () => ({ page: appPage }));
vi.mock('$app/navigation', () => ({ invalidate: invalidateMock }));

const person = { id: 'person-a', rank: 'SPC', firstName: 'Avery', lastName: 'Able' } as Personnel;
const recordPath = '/org/org-alpha/personnel/able-avery';
const rosterPath = '/org/org-alpha/personnel';
const archivedPath = rosterPath;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const goTo = (path: string) => (appPage.url = new URL(`http://localhost${path}`));
const restored = { restoredIds: ['person-a'], changedIds: [], withdrawnRequestIds: [], reviewedRequestIds: [] };

/** Answers each endpoint the way the server does; `undo` is the one request the test watches. */
function server(routes: { delete?: Response; batch?: Response; undo?: Response }) {
	return vi.fn(async (url: string, init?: RequestInit) => {
		if (url.endsWith('/archive-batch/undo')) return routes.undo ?? Response.json(restored);
		if (url.endsWith('/archive-batch')) return routes.batch ?? new Response(null, { status: 500 });
		if (init?.method === 'DELETE') return routes.delete ?? new Response(null, { status: 500 });
		throw new Error(`unexpected ${url}`);
	});
}
const undoRequests = (fetchMock: ReturnType<typeof server>) =>
	fetchMock.mock.calls.filter(([url]) => url.endsWith('/archive-batch/undo')).map(([, init]) => init?.body);

beforeEach(() => {
	goTo(recordPath);
	invalidateMock.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('archivePersonnel outside the loaded roster', () => {
	it.each([
		['archive', () => new Response(null, { status: 200 })],
		['failure', () => new Response(null, { status: 503 })]
	] as const)('reports no %s that arrives after the Organization shell ends', async (_outcome, response) => {
		let respond!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise<Response>((resolve) => (respond = resolve)))
		);
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const error = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		const pending = archivePersonnel({ orgId: 'org-not-loaded', person, archivedPath });
		endOrganizationLifetime();
		respond(response());

		expect(await settles(pending)).toBe(false);
		expect(success).not.toHaveBeenCalled();
		expect(error).not.toHaveBeenCalled();
	});
});

describe('archivePersonnel Undo after a direct archive', () => {
	const archived = (body: unknown = { success: true, undo: 'token-1' }) => server({ delete: Response.json(body) });

	it('offers Undo for ten seconds with the token the server issued, and drops the Person from the loaded roster', async () => {
		personnelStore.load([person], 'org-1');
		vi.stubGlobal('fetch', archived());
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');

		await expect(archivePersonnel({ orgId: 'org-1', person, archivedPath })).resolves.toBe('archived');

		expect(success.mock.calls.map(([, duration, action]) => [duration, action])).toEqual([
			[10_000, { label: 'Undo', onClick: expect.any(Function) }]
		]);
		expect(personnelStore.getById('person-a')).toBeUndefined();
	});

	it('offers no Undo when the server issued no token', async () => {
		vi.stubGlobal('fetch', archived({ success: true }));
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');

		await archivePersonnel({ orgId: 'org-1', person, archivedPath });

		expect(success.mock.calls.map(([, duration, action]) => [duration, action])).toEqual([[undefined, undefined]]);
	});

	it('sends nothing when Undo is pressed after the Organization shell ends', async () => {
		const fetchMock = archived();
		vi.stubGlobal('fetch', fetchMock);
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		await archivePersonnel({ orgId: 'org-1', person, archivedPath });

		endOrganizationLifetime();
		success.mock.calls[0][2]?.onClick();
		await flush();

		expect(undoRequests(fetchMock)).toEqual([]);
	});

	it.each([
		['the record it started on', recordPath],
		['the roster the archive sends the reader to', rosterPath]
	])('restores the Person when Undo is pressed on %s', async (_page, path) => {
		const fetchMock = archived();
		vi.stubGlobal('fetch', fetchMock);
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		await archivePersonnel({ orgId: 'org-1', person, archivedPath });

		goTo(path);
		success.mock.calls[0][2]?.onClick();
		await flush();

		expect(undoRequests(fetchMock)).toEqual([JSON.stringify({ token: 'token-1' })]);
	});

	it.each(['/org/org-alpha/calendar', '/org/org-alpha/personnel/baker-blake', '/org/org-bravo/personnel'])(
		'sends nothing when Undo is pressed after the reader moved on to %s',
		async (path) => {
			const fetchMock = archived();
			vi.stubGlobal('fetch', fetchMock);
			const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
			await archivePersonnel({ orgId: 'org-1', person, archivedPath });

			goTo(rosterPath);
			goTo(path);
			success.mock.calls[0][2]?.onClick();
			await flush();

			expect(undoRequests(fetchMock)).toEqual([]);
		}
	);
});

describe('archivePersonnel when the actor needs approval', () => {
	const needsApproval = new Response(JSON.stringify({ requiresApproval: true }), { status: 202 });
	const requested = (undo?: string) =>
		Response.json({ archivedIds: [], approvalRequestedIds: ['person-a'], errors: [], ...(undo ? { undo } : {}) });

	it('submits the request through the archive batch and offers Undo that withdraws it', async () => {
		const fetchMock = server({ delete: needsApproval.clone(), batch: requested('request-token') });
		vi.stubGlobal('fetch', fetchMock);
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const info = vi.spyOn(toastStore, 'info').mockImplementation(() => 'toast-id');

		await expect(archivePersonnel({ orgId: 'org-1', person, archivedPath })).resolves.toBe('approval_requested');

		expect(
			fetchMock.mock.calls.filter(([url]) => url.endsWith('/archive-batch')).map(([, init]) => init?.body)
		).toEqual([JSON.stringify({ ids: ['person-a'] })]);
		expect(success.mock.calls.map(([, duration]) => duration)).toEqual([10_000]);
		expect(info).not.toHaveBeenCalled();

		success.mock.calls[0][2]?.onClick();
		await flush();
		expect(undoRequests(fetchMock)).toEqual([JSON.stringify({ token: 'request-token' })]);
	});

	it('stays live on the record page only, because the request does not leave it', async () => {
		const fetchMock = server({ delete: needsApproval.clone(), batch: requested('request-token') });
		vi.stubGlobal('fetch', fetchMock);
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		await archivePersonnel({ orgId: 'org-1', person, archivedPath });

		goTo(rosterPath);
		success.mock.calls[0][2]?.onClick();
		await flush();

		expect(undoRequests(fetchMock)).toEqual([]);
	});

	it('offers no Undo when a request was already pending', async () => {
		vi.stubGlobal('fetch', server({ delete: needsApproval.clone(), batch: requested() }));
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const info = vi.spyOn(toastStore, 'info').mockImplementation(() => 'toast-id');

		await expect(archivePersonnel({ orgId: 'org-1', person, archivedPath })).resolves.toBe('approval_requested');

		expect(success).not.toHaveBeenCalled();
		expect(info).toHaveBeenCalledOnce();
	});

	it.each([
		['the batch is refused', Response.json({ message: 'no' }, { status: 500 })],
		[
			'the batch reports the Person as an error',
			Response.json({ archivedIds: [], approvalRequestedIds: [], errors: [{ id: 'person-a', message: 'no' }] })
		]
	])('reports an error when %s', async (_case, batch) => {
		vi.stubGlobal('fetch', server({ delete: needsApproval.clone(), batch }));
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const error = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');

		await expect(archivePersonnel({ orgId: 'org-1', person, archivedPath })).resolves.toBe('error');

		expect(success).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalledOnce();
	});
});
