// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { SettingsArchivesSectionData } from '../settingsSectionTypes';

const { invalidateMock, toastError, toastSuccess, saveDownload } = vi.hoisted(() => ({
	invalidateMock: vi.fn(),
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
	saveDownload: vi.fn()
}));

vi.mock('$app/navigation', () => ({ invalidate: invalidateMock }));
vi.mock('$app/state', () => ({ page: { params: { orgId: 'org-1' } } }));
vi.mock('$lib/stores/toast.svelte', () => ({
	toastStore: { success: toastSuccess, error: toastError }
}));
vi.mock('$lib/utils/downloadBlob', () => ({ downloadBlob: saveDownload }));

import Page from './+page.svelte';
import { endOrganizationLifetime } from '$lib/stores/core';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	invalidateMock.mockReset();
	toastError.mockReset();
	toastSuccess.mockReset();
	saveDownload.mockReset();
});

const archivesSettings: SettingsArchivesSectionData = {
	rows: [
		{
			id: 'person-1',
			rank: 'SGT',
			firstName: 'Monica',
			lastName: 'Rivera',
			mos: '68W',
			groupName: 'Alpha',
			archivedAt: '2026-05-01T00:00:00.000Z',
			groupId: 'group-1',
			displayName: 'SGT Rivera, Monica',
			exportFileStem: 'rivera-monica'
		}
	],
	retention: { months: 12, purgeSummary: 'Records purge after 12 months.' },
	commands: { canRestore: true, canExport: true, canPermanentlyDelete: true }
};

function person(id: string, displayName: string, archivedAt: string, mos: string, groupName: string) {
	const [rank, rest] = [displayName.split(' ')[0], displayName.slice(displayName.indexOf(' ') + 1)];
	const [lastName, firstName] = rest.split(', ');
	return {
		id,
		rank,
		firstName,
		lastName,
		mos,
		groupName,
		archivedAt,
		groupId: null,
		displayName,
		exportFileStem: id
	};
}

const roster = [
	person('ortiz', 'SGT Ortiz, Daniela', '2025-06-18T04:00:00.000Z', '91B', 'Maint PLT'),
	person('lane', 'SPC Lane, Marcus', '2024-11-02T04:00:00.000Z', '92Y', '2nd PLT'),
	person('silva', 'PV2 Silva, Ana', '2026-08-22T04:00:00.000Z', '88M', '1st PLT')
];

function pageData(archivedPersonnel: SettingsArchivesSectionData, timeZone = 'UTC') {
	return { archivesSettings: { sections: { archivedPersonnel }, timeZone } } as never;
}

function rosterData(rows: SettingsArchivesSectionData['rows']) {
	return pageData({ ...archivesSettings, rows, retention: { months: 24, purgeSummary: '' } });
}

function renderRoster() {
	return render(Page, { props: { data: rosterData(roster) } as never });
}

function shownNames() {
	return screen
		.queryAllByRole('button', { name: /^Restore / })
		.map((button) => button.textContent?.replace('Restore', '').trim());
}

async function search(term: string) {
	await fireEvent.input(screen.getByRole('searchbox', { name: 'Search archived people' }), {
		target: { value: term }
	});
}

function bodyRows() {
	return screen.getAllByRole('row', { hidden: true }).slice(1);
}

/** A row's countdown label. The row carries it twice, once per layout, so read the first. */
function countdown(row: HTMLElement) {
	return within(row)
		.getAllByText(/^(\d+ (day|days|months)|Due now)$/)[0]
		.textContent?.trim();
}

describe('Archived personnel countdown', () => {
	it('lists the next deletion first and counts each person down to their automatic deletion', () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
		renderRoster();

		expect(screen.getByText('3 records · 24-month retention')).toBeTruthy();
		expect(shownNames()).toEqual(['SPC Lane, Marcus', 'SGT Ortiz, Daniela', 'PV2 Silva, Ana']);
		expect(countdown(bodyRows()[0])).toBe('14 days');
		expect(countdown(bodyRows()[1])).toBe('8 months');
		expect(countdown(bodyRows()[2])).toBe('22 months');
		expect(screen.getByRole('link', { name: 'Change retention' }).getAttribute('href')).toBe(
			'/org/org-1/settings/policies'
		);
	});

	it("dates each archive on the viewer's calendar day", () => {
		const evening = person('evening', 'SGT Ortiz, Daniela', '2026-10-20T03:00:00.000Z', '91B', 'Maint PLT');
		render(Page, { props: { data: pageData({ ...archivesSettings, rows: [evening] }, 'America/Anchorage') } as never });

		expect(within(bodyRows()[0]).getAllByText(/19 OCT 26/).length).toBeGreaterThan(0);
		expect(within(bodyRows()[0]).queryByText(/20 OCT 26/)).toBeNull();
	});

	it('moves a countdown past the cleanup run without a remount', async () => {
		vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
		vi.setSystemTime(new Date('2026-11-02T04:59:00Z'));
		renderRoster();
		expect(countdown(bodyRows()[0])).toBe('1 day');

		vi.advanceTimersByTime(2 * 60_000);
		await tick();

		expect(countdown(bodyRows()[0])).toBe('Due now');
	});

	it('refreshes the countdowns when the page becomes visible again', async () => {
		vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
		vi.setSystemTime(new Date('2026-11-02T04:59:00Z'));
		renderRoster();
		expect(countdown(bodyRows()[0])).toBe('1 day');

		vi.setSystemTime(new Date('2026-11-02T06:00:00Z'));
		document.dispatchEvent(new Event('visibilitychange'));
		await tick();

		expect(countdown(bodyRows()[0])).toBe('Due now');
	});

	it('shows only the people a search matches, says when no one matches and restores everyone after clearing', async () => {
		renderRoster();

		await search('maint');
		expect(shownNames()).toEqual(['SGT Ortiz, Daniela']);
		expect(screen.getByRole('status').textContent).toBe('1 of 3 archived people shown');

		await search('zzz');
		expect(shownNames()).toEqual([]);
		expect(screen.getByText('No archived people match "zzz".')).toBeTruthy();
		expect(screen.getByRole('status').textContent).toBe('0 of 3 archived people shown');

		await search('');
		expect(shownNames()).toEqual(['SPC Lane, Marcus', 'SGT Ortiz, Daniela', 'PV2 Silva, Ana']);
		expect(screen.queryByText('No archived people match "zzz".')).toBeNull();
		expect(screen.getByRole('status').textContent?.trim()).toBe('');
	});

	it('removes a restored person at once, moves focus to the next row and shows the refreshed archive', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
		const view = renderRoster();
		const hughes = person('hughes', 'PFC Hughes, Carter', '2025-09-30T04:00:00.000Z', '88M', '1st PLT');
		const refresh = Promise.withResolvers<void>();
		invalidateMock.mockImplementation(async (dependency: string) => {
			await refresh.promise;
			if (dependency === 'app:settings-archived-people')
				await view.rerender({ data: rosterData([roster[0], roster[2], hughes]) });
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Restore SPC Lane, Marcus' }));

		await waitFor(() => expect(shownNames()).toEqual(['SGT Ortiz, Daniela', 'PV2 Silva, Ana']));
		expect(fetch).toHaveBeenCalledWith('/org/org-1/api/personnel', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'restore', id: 'lane' })
		});
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Restore SGT Ortiz, Daniela' }));

		refresh.resolve();
		await waitFor(() => expect(shownNames()).toEqual(['SGT Ortiz, Daniela', 'PFC Hughes, Carter', 'PV2 Silva, Ana']));
		expect(toastSuccess).toHaveBeenCalledOnce();
		expect(screen.getByText('3 records · 24-month retention')).toBeTruthy();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Restore SGT Ortiz, Daniela' }));
	});
});

describe('Archived personnel permanent delete', () => {
	it('names the person to type and keeps Delete permanently disabled until the text matches exactly', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
		render(Page, { props: { data: pageData(archivesSettings) } as never });

		await fireEvent.click(screen.getByRole('button', { name: 'Delete SGT Rivera, Monica' }));
		const dialog = within(await screen.findByRole('dialog', { name: 'Delete SGT Rivera, Monica?' }));
		const input = dialog.getByLabelText('Type SGT Rivera, Monica to confirm');
		const confirm = dialog.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement;

		for (const typed of ['', 'SGT Rivera', 'sgt rivera, monica']) {
			await fireEvent.input(input, { target: { value: typed } });
			expect(input).toHaveAccessibleDescription('Keep typing. It has to match exactly.');
			expect(confirm.disabled).toBe(true);
		}
		await fireEvent.input(input, { target: { value: 'SGT Rivera, Monica' } });
		expect(input).not.toHaveAccessibleDescription();
		expect(dialog.queryByText('Keep typing. It has to match exactly.')).toBeNull();
		expect(confirm.disabled).toBe(false);
	});

	it('keeps the typed name when the delete is rejected', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
		vi.stubGlobal('fetch', fetchMock);
		render(Page, {
			props: { data: pageData(archivesSettings) } as never
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Delete SGT Rivera, Monica' }));
		const confirmation = (await screen.findByLabelText('Type SGT Rivera, Monica to confirm')) as HTMLInputElement;
		await fireEvent.input(confirmation, { target: { value: 'SGT Rivera, Monica' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

		await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/permanent', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: 'person-1' })
		});
		expect((screen.getByLabelText('Type SGT Rivera, Monica to confirm') as HTMLInputElement).value).toBe(
			'SGT Rivera, Monica'
		);
		expect(invalidateMock).not.toHaveBeenCalled();
	});
	it.each([
		{ remaining: 0, focused: () => screen.getByRole('heading', { name: 'Archived people' }) },
		{ remaining: 1, focused: () => screen.getByRole('button', { name: 'Restore SGT Chen, Lee' }) }
	])('moves focus to a stable target after deleting a row leaves $remaining rows', async ({ remaining, focused }) => {
		const second = {
			...archivesSettings.rows[0],
			id: 'person-2',
			lastName: 'Chen',
			firstName: 'Lee',
			displayName: 'SGT Chen, Lee'
		};
		const dataWith = (rows: typeof archivesSettings.rows) => pageData({ ...archivesSettings, rows });
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
		const view = render(Page, {
			props: { data: dataWith(remaining === 0 ? archivesSettings.rows : [archivesSettings.rows[0], second]) } as never
		});
		invalidateMock.mockImplementation(async (dependency: string) => {
			if (dependency === 'app:settings-archived-people')
				await view.rerender({ data: dataWith(remaining === 0 ? [] : [second]) });
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Delete SGT Rivera, Monica' }));
		const confirmation = (await screen.findByLabelText('Type SGT Rivera, Monica to confirm')) as HTMLInputElement;
		await fireEvent.input(confirmation, { target: { value: 'SGT Rivera, Monica' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

		await waitFor(() => expect(document.activeElement?.contains(focused())).toBe(true));
	});

	it('holds the other actions of a row while its Restore is in flight', async () => {
		let respond!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise<Response>((resolve) => (respond = resolve)))
		);
		render(Page, {
			props: { data: pageData(archivesSettings) } as never
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Restore SGT Rivera, Monica' }));

		for (const name of [/Restore/, /Export/, /Delete/]) {
			expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
		}
		await fireEvent.click(screen.getByRole('button', { name: 'Delete SGT Rivera, Monica' }));
		expect(screen.queryByRole('dialog')).toBeNull();

		respond(new Response(null, { status: 500 }));
		await waitFor(() =>
			expect((screen.getByRole('button', { name: 'Delete SGT Rivera, Monica' }) as HTMLButtonElement).disabled).toBe(
				false
			)
		);
		expect((screen.getByRole('button', { name: 'Export SGT Rivera, Monica' }) as HTMLButtonElement).disabled).toBe(
			false
		);
	});
});

describe('Archived personnel actions after leaving the Organization', () => {
	/** Holds the next fetch. Answering it waits until the page has handled the response. */
	function heldFetch() {
		let respond!: (response: Response) => void;
		const reply = new Promise<Response>((resolve) => (respond = resolve));
		vi.stubGlobal(
			'fetch',
			vi.fn(() => reply)
		);
		render(Page, {
			props: { data: pageData(archivesSettings) } as never
		});
		return async (response: Response) => {
			respond(response);
			await reply;
			await tick();
		};
	}

	it.each([
		['success', () => new Response(null, { status: 200 })],
		['failure', () => Response.json({ message: 'Restore denied' }, { status: 403 })]
	] as const)('reports nothing when a restore %s finishes after the shell ends', async (_outcome, response) => {
		const respond = heldFetch();
		await fireEvent.click(screen.getByRole('button', { name: 'Restore SGT Rivera, Monica' }));

		endOrganizationLifetime();
		await respond(response());

		expect(toastSuccess).not.toHaveBeenCalled();
		expect(toastError).not.toHaveBeenCalled();
		expect(invalidateMock).not.toHaveBeenCalled();
	});

	it.each([
		['success', () => new Response(null, { status: 200 })],
		['failure', () => new Response(null, { status: 500 })]
	] as const)(
		'reports nothing when a permanent delete %s finishes after the shell ends',
		async (_outcome, response) => {
			const respond = heldFetch();
			await fireEvent.click(screen.getByRole('button', { name: 'Delete SGT Rivera, Monica' }));
			await fireEvent.input(await screen.findByLabelText('Type SGT Rivera, Monica to confirm'), {
				target: { value: 'SGT Rivera, Monica' }
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

			endOrganizationLifetime();
			await respond(response());

			expect(toastSuccess).not.toHaveBeenCalled();
			expect(toastError).not.toHaveBeenCalled();
			expect(invalidateMock).not.toHaveBeenCalled();
		}
	);

	it('still downloads a requested export but reports no late export failure', async () => {
		const respondSaved = heldFetch();
		await fireEvent.click(screen.getByRole('button', { name: 'Export SGT Rivera, Monica' }));
		endOrganizationLifetime();
		await respondSaved(new Response('workbook', { status: 200 }));
		await waitFor(() => expect(saveDownload).toHaveBeenCalledWith(expect.anything(), 'rivera-monica-records.xlsx'));
		cleanup();

		const respondFailed = heldFetch();
		await fireEvent.click(screen.getByRole('button', { name: 'Export SGT Rivera, Monica' }));
		endOrganizationLifetime();
		await respondFailed(new Response(null, { status: 503 }));
		expect((screen.getByRole('button', { name: 'Export SGT Rivera, Monica' }) as HTMLButtonElement).disabled).toBe(
			false
		);

		expect(toastError).not.toHaveBeenCalled();
	});
});
