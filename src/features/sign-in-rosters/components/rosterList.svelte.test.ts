import { afterEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from '$lib/stores/toast.svelte';
import type { SignInRoster } from '../sign-in-rosters.types';
import { RosterList } from './rosterList.svelte';

const SCAN = 'org-1/sign-in-rosters/signed/scan.pdf';

function roster(id: string, signedFilePath: string | null): SignInRoster {
	return {
		id,
		title: id,
		rosterDate: null,
		blankDate: true,
		separateByGroup: false,
		sortBy: 'alphabetical',
		personnelSnapshot: [],
		filterConfig: null,
		signedFilePath,
		createdBy: 'user-1',
		createdAt: '2026-03-28T12:00:00.000Z'
	};
}

function reply(body: unknown, status = 200) {
	return { ok: status < 300, status, json: async () => body } as Response;
}

async function loaded(unsigned: number, rosters: SignInRoster[]) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => reply({ rosters, total: 21, unsigned }))
	);
	const list = new RosterList('org-1');
	await list.load(true);
	return list;
}

describe('RosterList waiting-on-scan count', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('reads the count the server reports for every page', async () => {
		const list = await loaded(1, [roster('signed', SCAN)]);

		expect(list.waitingOnScan).toBe(1);
	});

	it('drops by one when a scan is attached to a roster that had none, and not when one is replaced', async () => {
		const list = await loaded(2, [roster('bare', null), roster('signed', SCAN)]);
		const upload = (path: string) => vi.fn(async () => reply({ filePath: path }));

		vi.stubGlobal('fetch', upload('org-1/sign-in-rosters/bare/new.pdf'));
		await list.uploadScan(list.rosters[0], new File(['%PDF'], 'new.pdf', { type: 'application/pdf' }));
		expect(list.waitingOnScan).toBe(1);

		vi.stubGlobal('fetch', upload('org-1/sign-in-rosters/signed/newer.pdf'));
		await list.uploadScan(list.rosters[1], new File(['%PDF'], 'newer.pdf', { type: 'application/pdf' }));
		expect(list.waitingOnScan).toBe(1);
	});

	it('rises by one when a scan is removed', async () => {
		const list = await loaded(0, [roster('signed', SCAN)]);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => reply({ success: true }))
		);

		await list.removeScan(list.rosters[0]);

		expect(list.waitingOnScan).toBe(1);
	});

	it('drops by one only when the deleted roster had no scan', async () => {
		const list = await loaded(1, [roster('bare', null), roster('signed', SCAN)]);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => reply({ success: true }))
		);

		await list.deleteRoster(list.rosters[1]);
		expect(list.waitingOnScan).toBe(1);

		await list.deleteRoster(list.rosters[0]);
		expect(list.waitingOnScan).toBe(0);
	});
});

describe('RosterList failures', () => {
	const ANY_ERROR = expect.stringMatching(/\S/);

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function serve(onDelete: () => Promise<Response>, listed: () => SignInRoster[]) {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
			init?.method === 'DELETE' ? onDelete() : reply({ rosters: listed(), total: listed().length, unsigned: 0 })
		);
		vi.stubGlobal('fetch', fetchMock);
		return fetchMock;
	}

	it('keeps a scan that changed since the list loaded and reloads to show the newer one', async () => {
		const newer = 'org-1/sign-in-rosters/signed/newer.pdf';
		let current = SCAN;
		const fetchMock = serve(
			async () => {
				current = newer;
				return reply({ message: 'This signed scan changed. Reload to review it.' }, 409);
			},
			() => [roster('signed', current)]
		);
		const list = new RosterList('org-1');
		await list.load(true);

		await list.removeScan(list.rosters[0]);

		expect(list.scanErrors.get('signed')).toBe('This signed scan changed. Reload to review it.');
		await vi.waitFor(() => expect(list.rosters[0]?.signedFilePath).toBe(newer));
		expect(fetchMock.mock.calls.filter(([, init]) => init?.method !== 'DELETE')).toHaveLength(2);
	});

	it.each([
		['a refused remove', () => Promise.resolve(reply({ message: 'Not allowed' }, 403)), 'Not allowed'],
		['a remove failure without a public message', () => Promise.resolve(reply({ message: 42 }, 500)), ANY_ERROR],
		['a remove that never reaches the server', () => Promise.reject(new TypeError('Failed to fetch')), ANY_ERROR]
	])('keeps the scan and shows an error for %s', async (_case, onDelete, shown) => {
		serve(onDelete, () => [roster('signed', SCAN)]);
		const list = new RosterList('org-1');
		await list.load(true);

		await list.removeScan(list.rosters[0]);

		expect(list.rosters[0].signedFilePath).toBe(SCAN);
		expect(list.scanErrors.get('signed')).toEqual(shown);
	});

	it.each([
		['a refused deletion', () => Promise.resolve(reply({ message: 'Not allowed' }, 403)), 'Not allowed'],
		['a deletion failure without a public message', () => Promise.resolve(reply({}, 500)), ANY_ERROR],
		['a deletion that never reaches the server', () => Promise.reject(new TypeError('Failed to fetch')), ANY_ERROR]
	])('keeps the roster and the confirmation open after %s', async (_case, onDelete, shown) => {
		serve(onDelete, () => [roster('bare', null)]);
		const list = new RosterList('org-1');
		await list.load(true);

		expect(await list.deleteRoster(list.rosters[0])).toBe(false);

		expect(list.rosters.map((kept) => kept.id)).toEqual(['bare']);
		expect(list.total).toBe(1);
		expect(list.deleteError).toEqual(shown);
	});

	it('drops a roster the server says is already gone and tells the user', async () => {
		serve(
			async () => reply({ message: 'This roster is no longer available.' }, 404),
			() => [roster('bare', null)]
		);
		const error = vi.spyOn(toastStore, 'error');
		const list = new RosterList('org-1');
		await list.load(true);

		expect(await list.deleteRoster(list.rosters[0])).toBe(true);

		expect(list.rosters).toEqual([]);
		expect(list.total).toBe(0);
		expect(error).toHaveBeenCalledOnce();
	});

	it('writes nothing when a remove or delete finishes after the sheet closes', async () => {
		let finish!: (response: Response) => void;
		const held = new Promise<Response>((resolve) => (finish = resolve));
		serve(
			() => held,
			() => [roster('signed', SCAN), roster('bare', null)]
		);
		const success = vi.spyOn(toastStore, 'success');
		const list = new RosterList('org-1');
		await list.load(true);

		const removing = list.removeScan(list.rosters[0]);
		const deleting = list.deleteRoster(list.rosters[1]);
		list.dispose();
		finish(reply({ success: true }));
		await Promise.all([removing, deleting]);

		expect(list.rosters.map((kept) => [kept.id, kept.signedFilePath])).toEqual([
			['signed', SCAN],
			['bare', null]
		]);
		expect(list.total).toBe(2);
		expect(success).not.toHaveBeenCalled();
	});
});
