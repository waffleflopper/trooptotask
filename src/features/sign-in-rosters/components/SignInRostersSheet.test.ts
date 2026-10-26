// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAutoTable } = vi.hoisted(() => ({ mockAutoTable: vi.fn() }));

vi.mock('jspdf', () => ({
	jsPDF: vi.fn(function (this: Record<string, unknown>) {
		this.internal = { pageSize: { getWidth: () => 612 } };
		this.save = vi.fn();
		this.text = vi.fn();
		this.setFontSize = vi.fn();
	})
}));
vi.mock('jspdf-autotable', () => ({ default: mockAutoTable }));

import SignInRostersSheet from './SignInRostersSheet.svelte';
import type { Personnel } from '$features/personnel/contracts';
import type { SignInRoster } from '../sign-in-rosters.types';
import { toastStore } from '$lib/stores/toast.svelte';
import { endOrganizationLifetime } from '$lib/stores/core';

function person(overrides: Partial<Personnel>): Personnel {
	return {
		id: 'person-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'Alex',
		mos: '11B',
		clinicRole: '',
		groupId: 'group-1',
		groupName: 'Alpha',
		...overrides
	};
}

const personnel: Personnel[] = [
	person({ id: 'p1', lastName: 'Able', mos: '68W', clinicRole: 'Medic', groupId: 'group-1', groupName: 'Alpha' }),
	person({ id: 'p2', lastName: 'Baker', mos: '68W', clinicRole: 'Driver', groupId: 'group-2', groupName: 'Bravo' }),
	person({ id: 'p3', lastName: 'Cole', mos: '11B', clinicRole: 'Medic', groupId: 'group-1', groupName: 'Alpha' })
];
const groups = [
	{ id: 'group-1', name: 'Alpha', sortOrder: 0 },
	{ id: 'group-2', name: 'Bravo', sortOrder: 1 }
];
const SAVED_SCAN = 'org-1/sign-in-rosters/roster-1/signed-roster.pdf';
const pdf = () => new File(['%PDF'], 'signed-roster.pdf', { type: 'application/pdf' });

function roster(overrides: Partial<SignInRoster> = {}): SignInRoster {
	return {
		id: 'roster-1',
		title: 'Morning Formation',
		rosterDate: '2026-03-28',
		blankDate: false,
		separateByGroup: false,
		sortBy: 'alphabetical',
		personnelSnapshot: [{ id: 'p1', rank: 'SGT', lastName: 'Able', firstName: 'Alex', group: 'Alpha' }],
		filterConfig: { groups: [], ranks: [], mos: [], roles: [] },
		signedFilePath: null,
		createdBy: 'user-1',
		createdAt: '2026-03-28T12:00:00.000Z',
		...overrides
	};
}

function json(data: unknown, ok = true, status = ok ? 200 : 500): Response {
	return { ok, status, json: vi.fn().mockResolvedValue(data) } as unknown as Response;
}

function unsignedIn(rosters: SignInRoster[]) {
	return rosters.filter((saved) => !saved.signedFilePath).length;
}

function listFetch(rosters: SignInRoster[], total = rosters.length) {
	return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
		(init?.method ?? 'GET') === 'GET' ? json({ rosters, total, unsigned: unsignedIn(rosters) }) : json({})
	);
}

function renderSheet(canEdit = true) {
	return render(SignInRostersSheet, {
		props: { orgId: 'org-1', orgName: 'C Co', personnel, groups, pinnedGroups: [], canEdit, onClose: vi.fn() }
	});
}

/** The numbers in the sheet's description: how many are saved, then how many wait on a scan when any do. */
function headerCounts() {
	const id = screen.getByRole('dialog').getAttribute('aria-describedby');
	const description = id ? document.getElementById(id) : null;
	return (description?.textContent?.match(/\d+/g) ?? []).map(Number);
}

function previewedNames() {
	const preview = screen.getByTestId('roster-print-preview');
	return [...preview.querySelectorAll('tbody tr')].flatMap((row) => {
		const cells = row.querySelectorAll('td');
		return cells.length === 4 ? [cells[2].textContent?.trim() ?? ''] : [];
	});
}

async function openNewRoster() {
	await fireEvent.click(await screen.findByRole('button', { name: 'New roster' }));
	return screen.findByRole('heading', { name: 'New sign-in roster' });
}

async function choose(filter: string, option: string) {
	const input = screen.getByRole('combobox', { name: filter });
	await fireEvent.focus(input);
	await fireEvent.click(await screen.findByRole('option', { name: option }));
}

describe('SignInRostersSheet list', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('counts the saved rosters and those still waiting on a signed scan', async () => {
		vi.stubGlobal(
			'fetch',
			listFetch([
				roster(),
				roster({ id: 'roster-2', title: 'Range', signedFilePath: SAVED_SCAN }),
				roster({ id: 'roster-3' })
			])
		);
		renderSheet();

		await waitFor(() => expect(headerCounts()).toEqual([3, 2]));
	});

	it('counts rosters waiting on a scan across every page, not just the loaded ones', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => json({ rosters: [roster({ signedFilePath: SAVED_SCAN })], total: 21, unsigned: 1 }))
		);
		renderSheet();

		await waitFor(() => expect(headerCounts()).toEqual([21, 1]));
		expect(screen.getByRole('button', { name: 'Show more' })).toBeTruthy();
	});

	it('shows the next page after Show more', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const offset = new URL(String(input), 'http://localhost').searchParams.get('offset');
			return offset === '0'
				? json({ rosters: [roster()], total: 2, unsigned: 2 })
				: json({ rosters: [roster({ id: 'roster-2', title: 'Range safety brief' })], total: 2, unsigned: 2 });
		});
		vi.stubGlobal('fetch', fetchMock);
		renderSheet();

		await fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));

		expect(await screen.findByText('Range safety brief')).toBeTruthy();
		expect(screen.getByText('Morning Formation')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
	});

	it('shows a load failure with Retry instead of the empty state, then recovers', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(json({ message: 'Sign-in rosters are unavailable.' }, false))
				.mockResolvedValueOnce(json({ rosters: [roster()], total: 1 }))
		);
		renderSheet();

		expect((await screen.findByRole('alert')).textContent).toContain('Sign-in rosters are unavailable.');
		expect(screen.queryByText('No sign-in rosters yet.')).toBeNull();
		expect(headerCounts()).toEqual([]);

		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

		expect(await screen.findByText('Morning Formation')).toBeTruthy();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('reprints a roster saved before MOS and Role filters existed from its saved snapshot', async () => {
		vi.stubGlobal(
			'fetch',
			listFetch([
				roster({
					filterConfig: { groups: [], ranks: ['SGT'] } as unknown as SignInRoster['filterConfig'],
					personnelSnapshot: [{ id: 'gone', rank: 'SGT', lastName: 'Prior', firstName: 'Person', group: 'Old Group' }]
				})
			])
		);
		renderSheet();

		await fireEvent.click(await screen.findByRole('button', { name: 'Reprint Morning Formation' }));

		await waitFor(() =>
			expect(mockAutoTable.mock.calls[0]?.[1].body).toEqual([
				[{ content: '1', styles: { halign: 'center' } }, 'SGT', 'Prior, Person', '']
			])
		);
	});

	it('attaches a PDF dropped on a row as that roster’s signed scan', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
			String(input).endsWith('/roster-2/upload') && init?.method === 'POST'
				? json({ filePath: 'org-1/sign-in-rosters/roster-2/signed-roster.pdf' })
				: json({ rosters: [roster(), roster({ id: 'roster-2', title: 'Range safety brief' })], total: 2, unsigned: 2 })
		);
		vi.stubGlobal('fetch', fetchMock);
		renderSheet();
		const row = (await screen.findByText('Range safety brief')).closest('li') as HTMLElement;
		expect(headerCounts()).toEqual([2, 2]);

		await fireEvent.dragEnter(row, { dataTransfer: { types: ['Files'] } });
		await fireEvent.drop(row, { dataTransfer: { files: [pdf()], types: ['Files'] } });

		expect(await within(row).findByRole('button', { name: 'Signed scan' })).toBeTruthy();
		expect(headerCounts()).toEqual([2, 1]);
		const uploads = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
		expect(uploads.map(([input]) => String(input))).toEqual(['/org/org-1/api/sign-in-rosters/roster-2/upload']);
		expect(uploads[0]?.[1]?.body).toBeInstanceOf(FormData);
		expect(
			within(screen.getByText('Morning Formation').closest('li')!).queryByRole('button', { name: 'Signed scan' })
		).toBeNull();
	});

	it('uploads a picked scan, naming the file while it uploads', async () => {
		let finish!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
				String(input).endsWith('/upload') && init?.method === 'POST'
					? new Promise<Response>((resolve) => (finish = resolve))
					: json({ rosters: [roster()], total: 1 })
			)
		);
		renderSheet();

		await fireEvent.change(await screen.findByLabelText('Signed scan file for Morning Formation'), {
			target: { files: [pdf()] }
		});
		const row = screen.getByText('Morning Formation').closest('li') as HTMLElement;
		expect(
			within(row)
				.getAllByRole('status')
				.map((status) => status.textContent)
				.join(' ')
		).toContain('signed-roster.pdf');
		expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true');

		finish(json({ filePath: SAVED_SCAN }));

		expect(await screen.findByRole('button', { name: 'Signed scan' })).toBeTruthy();
		expect(screen.getByRole('dialog').hasAttribute('aria-busy')).toBe(false);
	});

	it('refuses a scan that is not a PDF without uploading it', async () => {
		const fetchMock = listFetch([roster()]);
		vi.stubGlobal('fetch', fetchMock);
		renderSheet();

		await fireEvent.change(await screen.findByLabelText('Signed scan file for Morning Formation'), {
			target: { files: [new File(['x'], 'scan.txt', { type: 'text/plain' })] }
		});

		expect((await screen.findByRole('alert')).textContent).toBe('Only PDF files are allowed.');
		expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
	});

	it('reports nothing when a scan upload finishes after the Organization shell ends', async () => {
		let finish!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
				String(input).endsWith('/upload') && init?.method === 'POST'
					? new Promise<Response>((resolve) => (finish = resolve))
					: json({ rosters: [roster()], total: 1 })
			)
		);
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		renderSheet();
		await fireEvent.change(await screen.findByLabelText('Signed scan file for Morning Formation'), {
			target: { files: [pdf()] }
		});

		endOrganizationLifetime();
		finish(json({ filePath: SAVED_SCAN }));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(success).not.toHaveBeenCalled();
	});

	it('lets a read-only member open a signed scan but not attach one', async () => {
		vi.stubGlobal(
			'fetch',
			listFetch([roster({ signedFilePath: SAVED_SCAN }), roster({ id: 'roster-2', title: 'Range' })])
		);
		renderSheet(false);

		expect(await screen.findByRole('button', { name: 'Signed scan' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'New roster' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Add signed scan' })).toBeNull();
		expect(screen.queryByLabelText(/Signed scan file for/)).toBeNull();
	});

	it('shows an error and opens nothing when the scan link request fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				if (String(input).endsWith('/upload')) throw new TypeError('Failed to fetch');
				return json({ rosters: [roster({ signedFilePath: SAVED_SCAN })], total: 1 });
			})
		);
		const open = vi.fn();
		vi.stubGlobal('open', open);
		renderSheet(false);

		await fireEvent.click(await screen.findByRole('button', { name: 'Signed scan' }));

		expect((await screen.findByRole('alert')).textContent?.trim()).not.toBe('');
		expect(open).not.toHaveBeenCalled();
	});
});

describe('SignInRostersSheet new roster', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('narrows the audience across filters and within one, and saves the choice with the people', async () => {
		const fetchMock = listFetch([]);
		vi.stubGlobal('fetch', fetchMock);
		renderSheet();
		await openNewRoster();
		expect(previewedNames()).toEqual(['Able, Alex', 'Baker, Alex', 'Cole, Alex']);

		await choose('MOS', '68W');
		expect(previewedNames()).toEqual(['Able, Alex', 'Baker, Alex']);
		await choose('Role', 'Medic');
		expect(previewedNames()).toEqual(['Able, Alex']);
		await choose('Role', 'Driver');
		expect(previewedNames()).toEqual(['Able, Alex', 'Baker, Alex']);

		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Medic skills' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save and print' }));

		await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
		const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
		expect(post[0]).toBe('/org/org-1/api/sign-in-rosters');
		const body = JSON.parse(String(post[1]?.body));
		expect(body.personnelIds).toEqual(['p1', 'p2']);
		expect(body.filterConfig).toEqual({ groups: [], ranks: [], mos: ['68W'], roles: ['Medic', 'Driver'] });
		expect(body.personnelSnapshot).toBeUndefined();
	});

	it('blocks saving and previews nobody when the filters leave nobody', async () => {
		vi.stubGlobal('fetch', listFetch([]));
		renderSheet();
		await openNewRoster();
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Nobody' } });

		await choose('MOS', '11B');
		await choose('Role', 'Driver');

		expect(previewedNames()).toEqual([]);
		expect((screen.getByRole('button', { name: 'Save and print' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('previews the printed page from the same order the PDF is saved in', async () => {
		vi.stubGlobal('fetch', listFetch([]));
		renderSheet();
		await openNewRoster();
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Formation' } });
		await fireEvent.click(screen.getByLabelText('Split by group'));

		const preview = within(screen.getByTestId('roster-print-preview'));
		expect(preview.getByText('Formation')).toBeTruthy();
		const cells = preview.getAllByRole('row').map((row) => row.textContent);
		expect(cells.slice(1)).toEqual(['Alpha', '1SGTAble, Alex', '2SGTCole, Alex', 'Bravo', '3SGTBaker, Alex']);
	});

	it('returns to the list from a clean form, and asks before leaving a form with changes', async () => {
		vi.stubGlobal('fetch', listFetch([roster()]));
		renderSheet();
		await openNewRoster();

		await fireEvent.click(screen.getByRole('button', { name: 'Back to sign-in rosters' }));
		expect(await screen.findByText('Morning Formation')).toBeTruthy();

		await openNewRoster();
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Half written' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Back to sign-in rosters' }));

		const confirm = await screen.findByRole('alertdialog');
		await fireEvent.click(within(confirm).getByRole('button', { name: 'Keep editing' }));
		expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Half written');

		await fireEvent.click(screen.getByRole('button', { name: 'Back to sign-in rosters' }));
		await fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
		expect(await screen.findByText('Morning Formation')).toBeTruthy();
	});

	it('downloads nothing while the save is held, then prints the stored roster and lists it', async () => {
		let finish!: (response: Response) => void;
		const stored = roster({
			id: 'roster-2',
			title: 'Annual AT',
			personnelSnapshot: [{ id: 'p9', rank: 'SSG', lastName: 'Stored', firstName: 'Copy', group: 'Alpha' }]
		});
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
			init?.method === 'POST'
				? new Promise<Response>((resolve) => (finish = resolve))
				: json({ rosters: [], total: 0, unsigned: 0 })
		);
		vi.stubGlobal('fetch', fetchMock);
		renderSheet();
		await openNewRoster();
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Annual AT' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Save and print' }));
		await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));

		expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true');
		expect((screen.getByRole('button', { name: 'Back to sign-in rosters' }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByLabelText('Title').closest('fieldset')?.disabled).toBe(true);
		expect(mockAutoTable).not.toHaveBeenCalled();

		finish(json(stored));

		expect(await screen.findByRole('button', { name: 'New roster' })).toBeTruthy();
		await waitFor(() => expect(mockAutoTable).toHaveBeenCalledTimes(1));
		expect(mockAutoTable.mock.calls[0]?.[1].body).toEqual([
			[{ content: '1', styles: { halign: 'center' } }, 'SSG', 'Stored, Copy', '']
		]);
	});

	it('keeps the form and downloads nothing when the save is refused', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
				init?.method === 'POST'
					? json({ message: 'Personnel selection is limited to 500 personnel' }, false, 400)
					: json({ rosters: [], total: 0, unsigned: 0 })
			)
		);
		renderSheet();
		await openNewRoster();
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Annual AT' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save and print' }));

		expect((await screen.findByRole('alert')).textContent).toBe('Personnel selection is limited to 500 personnel');
		expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Annual AT');
		expect(mockAutoTable).not.toHaveBeenCalled();
	});

	it('downloads nothing when the save request fails outright', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				if (init?.method === 'POST') throw new TypeError('Failed to fetch');
				return json({ rosters: [], total: 0, unsigned: 0 });
			})
		);
		renderSheet();
		await openNewRoster();
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Annual AT' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save and print' }));

		expect((await screen.findByRole('alert')).textContent).toBe('Failed to fetch');
		expect(mockAutoTable).not.toHaveBeenCalled();
	});
});
