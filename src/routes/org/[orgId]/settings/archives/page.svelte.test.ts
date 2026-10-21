// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SettingsArchivesSectionData } from '../settingsSectionTypes';

const { invalidateMock, toastError, toastSuccess, saveDownload } = vi.hoisted(() => ({
	invalidateMock: vi.fn(),
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
	saveDownload: vi.fn()
}));

vi.mock('$app/navigation', () => ({ invalidate: invalidateMock }));
vi.mock('$app/stores', () => ({ page: writable({ params: { orgId: 'org-1' } }) }));
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

function rosterData(rows: SettingsArchivesSectionData['rows']) {
	return {
		archivesSettings: {
			sections: { archivedPersonnel: { ...archivesSettings, rows, retention: { months: 24, purgeSummary: '' } } }
		}
	} as never;
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

describe('Archived personnel countdown', () => {
	it('lists the next deletion first and counts each person down to their automatic deletion', () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
		renderRoster();

		expect(screen.getByText('3 records · 24-month retention')).toBeTruthy();
		expect(shownNames()).toEqual(['SPC Lane, Marcus', 'SGT Ortiz, Daniela', 'PV2 Silva, Ana']);
		expect(bodyRows().map((row) => within(row).getAllByRole('cell')[3].textContent?.trim())).toEqual([
			'14 days',
			'8 months',
			'22 months'
		]);
		expect(screen.getByRole('link', { name: 'Change retention' }).getAttribute('href')).toBe(
			'/org/org-1/settings/policies'
		);
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
		invalidateMock.mockImplementation(async (dependency: string) => {
			if (dependency === 'app:settings-archived-people')
				await view.rerender({ data: rosterData([roster[0], roster[2], hughes]) });
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Restore SPC Lane, Marcus' }));

		await waitFor(() => expect(shownNames()).toEqual(['SGT Ortiz, Daniela', 'PFC Hughes, Carter', 'PV2 Silva, Ana']));
		expect(toastSuccess).toHaveBeenCalledOnce();
		expect(screen.getByText('3 records · 24-month retention')).toBeTruthy();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Restore SGT Ortiz, Daniela' }));
	});
});

describe('Archived personnel permanent delete', () => {
	it('keeps the typed name when the delete is rejected', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
		vi.stubGlobal('fetch', fetchMock);
		render(Page, {
			props: { data: { archivesSettings: { sections: { archivedPersonnel: archivesSettings } } } } as never
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Delete SGT Rivera, Monica' }));
		const confirmation = (await screen.findByLabelText('Type the name to confirm')) as HTMLInputElement;
		await fireEvent.input(confirmation, { target: { value: 'SGT Rivera, Monica' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Permanently Delete' }));

		await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/permanent', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: 'person-1' })
		});
		expect((screen.getByLabelText('Type the name to confirm') as HTMLInputElement).value).toBe('SGT Rivera, Monica');
		expect(invalidateMock).not.toHaveBeenCalled();
	});
	it.each([
		{ remaining: 0, focused: () => screen.getByRole('heading', { name: 'Archived people' }).closest('header') },
		{ remaining: 1, focused: () => screen.getByRole('button', { name: 'Restore SGT Chen, Lee' }) }
	])('moves focus to a stable target after deleting a row leaves $remaining rows', async ({ remaining, focused }) => {
		const second = {
			...archivesSettings.rows[0],
			id: 'person-2',
			lastName: 'Chen',
			firstName: 'Lee',
			displayName: 'SGT Chen, Lee'
		};
		const dataWith = (rows: typeof archivesSettings.rows) =>
			({ archivesSettings: { sections: { archivedPersonnel: { ...archivesSettings, rows } } } }) as never;
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
		const view = render(Page, {
			props: { data: dataWith(remaining === 0 ? archivesSettings.rows : [archivesSettings.rows[0], second]) } as never
		});
		invalidateMock.mockImplementation(async (dependency: string) => {
			if (dependency === 'app:settings-archived-people')
				await view.rerender({ data: dataWith(remaining === 0 ? [] : [second]) });
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Delete SGT Rivera, Monica' }));
		const confirmation = (await screen.findByLabelText('Type the name to confirm')) as HTMLInputElement;
		await fireEvent.input(confirmation, { target: { value: 'SGT Rivera, Monica' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Permanently Delete' }));

		await waitFor(() => expect(document.activeElement).toBe(focused()));
	});

	it('holds the other actions of a row while its Restore is in flight', async () => {
		let respond!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise<Response>((resolve) => (respond = resolve)))
		);
		render(Page, {
			props: { data: { archivesSettings: { sections: { archivedPersonnel: archivesSettings } } } } as never
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
			props: { data: { archivesSettings: { sections: { archivedPersonnel: archivesSettings } } } } as never
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
			await fireEvent.input(await screen.findByLabelText('Type the name to confirm'), {
				target: { value: 'SGT Rivera, Monica' }
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Permanently Delete' }));

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
		expect(screen.getByRole('button', { name: 'Export SGT Rivera, Monica' }).textContent).toContain('Export');

		expect(toastError).not.toHaveBeenCalled();
	});
});
