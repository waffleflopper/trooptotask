import { afterEach, describe, expect, it, vi } from 'vitest';
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
