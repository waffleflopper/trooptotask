// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PersonnelImportPage from './PersonnelImportPage.svelte';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '../personnel.types';
import type { RankCatalogEntry } from '$features/personnel/contracts';

const { beforeNavigateMock, gotoMock, invalidateAllMock, parseFileMock } = vi.hoisted(() => ({
	beforeNavigateMock: vi.fn(),
	gotoMock: vi.fn(),
	invalidateAllMock: vi.fn(),
	parseFileMock: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	beforeNavigate: beforeNavigateMock,
	goto: gotoMock,
	invalidateAll: invalidateAllMock
}));

vi.mock('$lib/utils/csvParser', () => ({
	parseFile: parseFileMock
}));

type RenderPageProps = Partial<{
	groups: Group[];
	orgId: string;
	personnel: Personnel[];
	rankCatalog: RankCatalogEntry[];
}>;

const defaultRankCatalog: RankCatalogEntry[] = [
	{
		code: 'SGT',
		label: 'Sergeant',
		service: 'army',
		category: 'enlisted',
		payGrade: 'E-5',
		state: 'active',
		sortOrder: 0
	},
	{
		code: 'CPL',
		label: 'Corporal',
		service: 'army',
		category: 'enlisted',
		payGrade: 'E-4',
		state: 'active',
		sortOrder: 1
	}
];

function renderPage(props: RenderPageProps = {}) {
	return render(PersonnelImportPage, {
		props: {
			groups: [{ id: 'group-1', name: 'Alpha Team', sortOrder: 0 }],
			orgId: 'org-1',
			rankCatalog: defaultRankCatalog,
			personnel: [
				{
					id: 'person-1',
					firstName: 'Jane',
					lastName: 'Smith',
					rank: 'SGT',
					mos: '68W',
					clinicRole: 'Medic',
					groupId: 'group-1',
					groupName: 'Alpha Team',
					archivedAt: null,
					ets: null,
					deros: null
				}
			],
			...props
		}
	});
}

describe('PersonnelImportPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		parseFileMock.mockResolvedValue([]);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('renders as a full-page import workflow instead of a bulk manager dialog', () => {
		renderPage();

		expect(screen.getByRole('heading', { name: 'Build the roster from one file' })).toBeTruthy();
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(screen.queryByRole('tab', { name: /Backfill ETS/i })).toBeNull();
		expect(screen.getByText('Accepted headers')).toBeTruthy();
	});

	it('uses uploaded files as the only import input source', async () => {
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'MOS', 'Duty Role', 'Group', 'ETS', 'PCS / DEROS'],
			['SGT', 'Smith', 'John', '68W', 'Medic', 'Alpha Team', '2027-05-01', '2026-11-30']
		]);
		renderPage();

		expect(screen.queryByText(/or paste text/i)).toBeNull();
		expect(screen.queryByText('Paste Data')).toBeNull();
		expect(screen.queryByLabelText('Personnel Data')).toBeNull();
		expect(screen.getByText('Rank, Last Name, First Name, MOS, Duty Role, Group, ETS, PCS / DEROS')).toBeTruthy();

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		expect(input).toBeTruthy();
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});

		await waitFor(() => expect(screen.getByRole('button', { name: /Preview 1 Rows/i })).toBeTruthy());
		expect(parseFileMock).toHaveBeenCalledOnce();
	});

	it.each([
		['no rows', []],
		['only a header row', [['Rank', 'Last Name', 'First Name']]]
	])('says so when the chosen file has %s and keeps Preview unavailable', async (_case, rows) => {
		parseFileMock.mockResolvedValue(rows);
		renderPage();

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		await fireEvent.change(input!, { target: { files: [new File([''], 'empty.csv', { type: 'text/csv' })] } });

		const message = await screen.findByText('The file has no rows to import.');
		expect(message.getAttribute('data-slot')).toBe('field-error');
		expect(screen.getByRole('button', { name: /^Preview/ })).toBeDisabled();
	});

	it('ties an invalid preview cell to its issue text', async () => {
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'MOS', 'Duty Role', 'Group', 'ETS', 'PCS / DEROS'],
			['BAD', 'Invalid', 'Pat', '', '', '', '', '']
		]);
		renderPage();

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));

		const cell = await screen.findByLabelText('Row 2 Rank');
		expect(cell.getAttribute('aria-invalid')).toBe('true');
		const description = document.getElementById(cell.getAttribute('aria-describedby') ?? '');
		expect(description?.textContent).toBe(
			'"BAD" is not in the active Organization rank catalog. Update Organization Settings -> Ranks, then try again.'
		);
	});

	it('submits only checked valid rows with ETS and PCS / DEROS through the import batch', async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ inserted: [{}], errors: [] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'MOS', 'Duty Role', 'Group', 'ETS', 'PCS / DEROS'],
			['SGT', 'Smith', 'John', '68W', 'Medic', 'Alpha Team', '2027-05-01', '2026-11-30'],
			['BAD', 'Invalid', 'Pat', '', '', '', '', ''],
			['CPL', 'Unchecked', 'Alex', '', '', '', '', '']
		]);
		renderPage();

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		expect(input).toBeTruthy();
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 3 Rows/i }));
		await waitFor(() => expect(screen.getByDisplayValue('2027-05-01')).toBeTruthy());

		expect(screen.getByRole('checkbox', { name: /Select import row 2: Resolve row errors/i })).toBeDisabled();
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select import row 3' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Import checked rows' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/batch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				records: [
					{
						rank: 'SGT',
						lastName: 'Smith',
						firstName: 'John',
						mos: '68W',
						clinicRole: 'Medic',
						groupName: 'Alpha Team',
						ets: '2027-05-01',
						deros: '2026-11-30'
					}
				]
			})
		});
	});

	it('keeps the ETS / DEROS merge workflow reachable from the import page', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ updated: [{ id: 'person-1' }], errors: [], ambiguous: [] }), { status: 200 })
		);
		vi.stubGlobal('fetch', fetchMock);
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'Group', 'ETS', 'PCS / DEROS'],
			['SGT', 'Smith', 'Jane', 'Alpha Team', '2027-05-01', '2026-11-30']
		]);
		renderPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Backfill ETS/DEROS' }));
		expect(screen.getByRole('heading', { name: 'Backfill ETS/DEROS from one file' })).toBeInTheDocument();

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		expect(input).toBeTruthy();
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));
		await waitFor(() => expect(screen.getByDisplayValue('2027-05-01')).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: 'Backfill ETS/DEROS checked rows' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/merge', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				records: [
					{
						rank: 'SGT',
						lastName: 'Smith',
						firstName: 'Jane',
						groupName: 'Alpha Team',
						ets: '2027-05-01',
						deros: '2026-11-30'
					}
				]
			})
		});
	});

	it('shows skipped ETS / DEROS merge rows in the results', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						updated: [],
						errors: [],
						ambiguous: [],
						skipped: [{ index: 0, message: 'Matched personnel already has the requested values' }]
					}),
					{ status: 200 }
				)
		);
		vi.stubGlobal('fetch', fetchMock);
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'Group', 'ETS', 'PCS / DEROS'],
			['SGT', 'Smith', 'Jane', 'Alpha Team', '2027-05-01', '2026-11-30']
		]);
		renderPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Backfill ETS/DEROS' }));
		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		expect(input).toBeTruthy();
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Backfill ETS/DEROS checked rows' }));

		await waitFor(() => expect(screen.getByText('Skipped')).toBeInTheDocument());
		expect(screen.getByText(/Matched personnel already has the requested values/)).toBeInTheDocument();
		expect(screen.getByText('Import complete')).toBeInTheDocument();
	});

	it('shows template guidance before upload', () => {
		renderPage();

		expect(screen.getByText('Accepted headers')).toBeInTheDocument();
		expect(
			screen.getByText('Rank, Last Name, First Name, MOS, Duty Role, Group, ETS, PCS / DEROS')
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Use these headers' })).toBeInTheDocument();
		expect(screen.getByText(/Unknown groups import as unassigned/i)).toBeInTheDocument();
	});

	it('shows explicit row statuses, disabled reasons, and selected-row feedback', async () => {
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'Group'],
			['SGT', 'Smith', 'John', 'Alpha Team'],
			['BAD', 'Jones', 'Sam', 'Bravo Team'],
			['CPL', 'Taylor', 'Pat', 'Unknown Team']
		]);
		renderPage();

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 3 Rows/i }));

		const table = screen.getByRole('table', { name: 'Personnel import preview' });
		expect(screen.getByText('Review row status')).toBeInTheDocument();
		expect(screen.getByText('1 errors')).toBeInTheDocument();
		expect(screen.getByText('1 warnings')).toBeInTheDocument();
		expect(screen.getByText('2 ready')).toBeInTheDocument();
		expect(screen.getByText('Ready')).toBeInTheDocument();
		expect(screen.getByText('Blocked')).toBeInTheDocument();
		expect(screen.getByText('Warning')).toBeInTheDocument();
		expect(within(table).getAllByTitle(/will import as unassigned/i).length).toBeGreaterThan(0);
		expect(screen.getByLabelText('Row 4 Group')).toHaveAttribute('data-cell-state', 'warning');
		expect(screen.getByLabelText('Row 3 Rank')).toHaveAttribute('data-cell-state', 'error');
		expect(screen.getByRole('checkbox', { name: /Select import row 2: Resolve row errors/i })).toBeDisabled();
		expect(screen.getAllByText('2 of 3 selected').length).toBeGreaterThan(0);

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select import row 3' }));
		expect(screen.getAllByText('1 of 3 selected').length).toBeGreaterThan(0);
	});

	it('validates preview ranks through active Organization rank catalog options', async () => {
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name'],
			['po3', 'Nolan', 'Avery']
		]);
		renderPage({
			rankCatalog: [
				{
					code: 'PO3',
					label: 'Petty Officer Third Class',
					service: 'navy',
					category: 'enlisted',
					payGrade: 'E-4',
					state: 'active',
					sortOrder: 0
				}
			]
		});

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));

		expect(screen.getByLabelText('Row 2 Rank')).not.toHaveAttribute('data-cell-state', 'error');
		expect(screen.getAllByText('1 ready').length).toBeGreaterThan(0);
	});

	it('accepts retired catalog ranks for ETS / DEROS backfill while create import remains active-only', async () => {
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'ETS'],
			['SP4', 'Nolan', 'Avery', '2027-05-01']
		]);
		renderPage({
			rankCatalog: [
				{
					code: 'SGT',
					label: 'Sergeant',
					service: 'army',
					category: 'enlisted',
					payGrade: 'E-5',
					state: 'active',
					sortOrder: 0
				},
				{
					code: 'SP4',
					label: 'Specialist Four',
					service: 'army',
					category: 'enlisted',
					payGrade: 'E-4',
					state: 'retired',
					sortOrder: 1
				}
			]
		});

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));

		expect(screen.getByLabelText('Row 2 Rank')).toHaveAttribute('data-cell-state', 'error');
		expect(screen.getByLabelText('Row 2 Rank')).toHaveAccessibleDescription(
			/not in the active Organization rank catalog/
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Backfill ETS/DEROS' }));
		await fireEvent.change(document.querySelector<HTMLInputElement>('#fileUpload')!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));

		expect(screen.getByLabelText('Row 2 Rank')).not.toHaveAttribute('data-cell-state', 'error');
		expect(screen.getAllByText('1 ready').length).toBeGreaterThan(0);
	});

	it('accepts case-varied observed active personnel ranks for ETS / DEROS backfill', async () => {
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'ETS'],
			['sp4', 'Nolan', 'Avery', '2027-05-01']
		]);
		renderPage({
			rankCatalog: [
				{
					code: 'SGT',
					label: 'Sergeant',
					service: 'army',
					category: 'enlisted',
					payGrade: 'E-5',
					state: 'active',
					sortOrder: 0
				}
			],
			personnel: [
				{
					id: 'person-legacy',
					firstName: 'Avery',
					lastName: 'Nolan',
					rank: 'SP4',
					mos: '68W',
					clinicRole: 'Medic',
					groupId: 'group-1',
					groupName: 'Alpha Team',
					archivedAt: null,
					ets: null,
					deros: null
				}
			]
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Backfill ETS/DEROS' }));
		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));

		expect(screen.getByLabelText('Row 2 Rank')).not.toHaveAttribute('data-cell-state', 'error');
		expect(screen.getAllByText('1 ready').length).toBeGreaterThan(0);
		expect(screen.getByRole('button', { name: 'Backfill ETS/DEROS checked rows' })).toBeEnabled();
	});

	it('blocks malformed ETS and DEROS values before submission', async () => {
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'ETS', 'PCS / DEROS'],
			['SGT', 'Smith', 'John', '12/25/2026', '2026-02-30']
		]);
		renderPage();

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));

		expect(screen.getByLabelText('Row 2 ETS')).toHaveAttribute('data-cell-state', 'error');
		expect(screen.getByLabelText('Row 2 PCS / DEROS')).toHaveAttribute('data-cell-state', 'error');
		expect(screen.getByText('Select at least one valid row to import.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Import checked rows' })).toBeDisabled();
	});

	it('keeps invalid fields accessible and imports only after all corrections pass validation', async () => {
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'Group', 'ETS'],
			['BAD', 'Smith', 'John', 'Alpha Team', '2027-02-30']
		]);
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ inserted: [{ id: 'corrected-person' }], errors: [] })
		});
		vi.stubGlobal('fetch', fetchMock);
		renderPage();
		await fireEvent.change(document.querySelector<HTMLInputElement>('#fileUpload')!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));
		expect(screen.getByRole('button', { name: 'Import checked rows' })).toBeDisabled();
		const rank = screen.getByRole('textbox', { name: 'Row 2 Rank' });
		const ets = screen.getByRole('textbox', { name: 'Row 2 ETS' });
		expect(rank.closest('[aria-disabled="true"]')).toBeNull();
		expect(ets.closest('[aria-disabled="true"]')).toBeNull();
		expect(screen.getByRole('checkbox', { name: /Select import row 1:/ })).toBeDisabled();
		await fireEvent.change(rank, { target: { value: 'SGT' } });
		const submit = screen.getByRole('button', { name: 'Import checked rows' });
		expect(submit).toBeDisabled();
		expect(screen.getByRole('checkbox', { name: /Select import row 1:/ })).toBeDisabled();
		expect(ets.closest('[aria-disabled="true"]')).toBeNull();
		await fireEvent.change(ets, { target: { value: '2027-02-28' } });
		await waitFor(() => expect(submit).toBeEnabled());
		expect(screen.getByRole('checkbox', { name: 'Select import row 1' })).toBeEnabled();
		expect(screen.getByRole('checkbox', { name: 'Select import row 1' })).toBeChecked();
		await fireEvent.click(submit);
		await screen.findByRole('button', { name: 'Return to Personnel' });
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
			records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'John', groupName: 'Alpha Team', ets: '2027-02-28' }]
		});
	});

	it('disables import with a visible reason when no valid rows are selected', async () => {
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name'],
			['BAD', 'Smith', 'John']
		]);
		renderPage();

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));

		expect(screen.getByText('Select at least one valid row to import.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Import checked rows' })).toBeDisabled();
	});

	it('keeps the edited preview, selection and an alert when the import is rejected, and retries the same rows', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Service unavailable' }), { status: 503 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ inserted: [{}], errors: [] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name'],
			['SGT', 'Smith', 'John'],
			['CPL', 'Taylor', 'Pat']
		]);
		renderPage();
		await fireEvent.change(document.querySelector<HTMLInputElement>('#fileUpload')!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 2 Rows/i }));
		const firstName = screen.getByRole('textbox', { name: 'Row 2 First Name' });
		await fireEvent.change(firstName, { target: { value: 'Jonathan' } });
		await fireEvent.blur(firstName);
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select import row 2' }));

		await fireEvent.click(screen.getByRole('button', { name: 'Import checked rows' }));

		expect((await screen.findByText('Service unavailable')).closest('[role="alert"]')).not.toBeNull();
		expect(screen.queryByText('Import failed')).toBeNull();
		expect((screen.getByRole('textbox', { name: 'Row 2 First Name' }) as HTMLInputElement).value).toBe('Jonathan');
		expect(screen.getByRole('checkbox', { name: 'Select import row 1' })).toBeChecked();
		expect(screen.getByRole('checkbox', { name: 'Select import row 2' })).not.toBeChecked();

		await fireEvent.click(screen.getByRole('button', { name: 'Import checked rows' }));

		await screen.findByRole('button', { name: 'Return to Personnel' });
		expect(screen.queryByText('Service unavailable')).toBeNull();
		const expectedBody = { records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'Jonathan' }] };
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(expectedBody);
		expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(expectedBody);
	});

	it('drops an earlier import failure when another file is chosen', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ message: 'Service unavailable' }), { status: 503 }))
		);
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name'],
			['SGT', 'Smith', 'John']
		]);
		renderPage();
		const upload = (name: string) =>
			fireEvent.change(document.querySelector<HTMLInputElement>('#fileUpload')!, {
				target: { files: [new File(['records'], name, { type: 'text/csv' })] }
			});
		await upload('first.csv');
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Import checked rows' }));
		await screen.findByText('Service unavailable');

		await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
		await upload('second.csv');
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));

		expect(screen.queryByText('Service unavailable')).toBeNull();
	});

	it('names the status when a failed import has no message body', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('upstream down', { status: 502 }))
		);
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name'],
			['SGT', 'Smith', 'John']
		]);
		renderPage();
		await fireEvent.change(document.querySelector<HTMLInputElement>('#fileUpload')!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Import checked rows' }));

		expect((await screen.findByText('Import failed with status 502')).closest('[role="alert"]')).not.toBeNull();
		expect(screen.getByRole('button', { name: 'Import checked rows' })).toBeEnabled();
	});

	it('warns that rows may already be saved when the connection drops during an import', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')));
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name'],
			['SGT', 'Smith', 'John']
		]);
		renderPage();
		await fireEvent.change(document.querySelector<HTMLInputElement>('#fileUpload')!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Import checked rows' }));

		const message =
			'The connection dropped before the import was confirmed. Some rows may already be saved, so check Personnel before importing again.';
		expect((await screen.findByText(message)).closest('[role="alert"]')).not.toBeNull();
		expect(screen.getByRole('checkbox', { name: 'Select import row 1' })).toBeChecked();
	});

	it('keeps the preview and the import mode when the network drops, and retries the same rows', async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ updated: [{}], errors: [], ambiguous: [] }), { status: 200 })
			);
		vi.stubGlobal('fetch', fetchMock);
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'ETS'],
			['SGT', 'Smith', 'Jane', '2027-05-01']
		]);
		renderPage();
		await fireEvent.click(screen.getByRole('button', { name: 'Backfill ETS/DEROS' }));
		await fireEvent.change(document.querySelector<HTMLInputElement>('#fileUpload')!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));
		const ets = screen.getByRole('textbox', { name: 'Row 2 ETS' });
		await fireEvent.change(ets, { target: { value: '2028-01-15' } });
		await fireEvent.blur(ets);

		await fireEvent.click(screen.getByRole('button', { name: 'Backfill ETS/DEROS checked rows' }));

		expect(
			(await screen.findByText('The connection dropped before the backfill was confirmed. Try again.')).closest(
				'[role="alert"]'
			)
		).not.toBeNull();
		expect((screen.getByRole('textbox', { name: 'Row 2 ETS' }) as HTMLInputElement).value).toBe('2028-01-15');
		expect(screen.getByRole('checkbox', { name: 'Select import row 1' })).toBeChecked();

		await fireEvent.click(screen.getByRole('button', { name: 'Backfill ETS/DEROS checked rows' }));

		await screen.findByRole('button', { name: 'Return to Personnel' });
		expect(screen.queryByText('The connection dropped before the backfill was confirmed. Try again.')).toBeNull();
		const expectedBody = { records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'Jane', ets: '2028-01-15' }] };
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			'/org/org-1/api/personnel/merge',
			'/org/org-1/api/personnel/merge'
		]);
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(expectedBody);
		expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(expectedBody);
	});

	it('renders partial results with recovery actions and failed-row context', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ inserted: [{}], errors: [{ index: 1, message: 'Duplicate person' }] }), {
						status: 200
					})
			)
		);
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name'],
			['SGT', 'Smith', 'John'],
			['CPL', 'Taylor', 'Pat']
		]);
		renderPage();

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 2 Rows/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Import checked rows' }));

		expect(await screen.findByText('Import completed with issues')).toBeInTheDocument();
		expect(screen.getByText('Saved')).toBeInTheDocument();
		expect(screen.getByText('Failed')).toBeInTheDocument();
		expect(
			screen.getByText((content) => content.includes('Row 3:') && content.includes('Duplicate person'))
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Review failed rows' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Upload another file' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Return to Personnel' })).toBeInTheDocument();
	});

	it('corrects and retries only failed rows without reselecting unchecked or acknowledged creations', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						inserted: [{ id: 'saved-person' }],
						errors: [{ index: 1, message: 'Group is outside scope' }]
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(new Response(JSON.stringify({ inserted: [{ id: 'corrected-person' }], errors: [] })));
		vi.stubGlobal('fetch', fetchMock);
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'Group'],
			['SGT', 'Unchecked', 'Alex', 'Alpha Team'],
			['SGT', 'Saved', 'John', 'Alpha Team'],
			['CPL', 'NeedsCorrection', 'Pat', 'Outside Group']
		]);
		renderPage();
		await fireEvent.change(document.querySelector<HTMLInputElement>('#fileUpload')!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 3 Rows/i }));
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select import row 1' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Import checked rows' }));
		await screen.findByText((content) => content.includes('Row 4:') && content.includes('Group is outside scope'));
		await fireEvent.click(screen.getByRole('button', { name: 'Review failed rows' }));
		await fireEvent.change(screen.getByRole('textbox', { name: 'Row 4 Group' }), { target: { value: 'Alpha Team' } });
		await fireEvent.blur(screen.getByRole('textbox', { name: 'Row 4 Group' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Import checked rows' }));
		await screen.findByRole('button', { name: 'Return to Personnel' });
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
			records: [
				{ rank: 'SGT', lastName: 'Saved', firstName: 'John', groupName: 'Alpha Team' },
				{ rank: 'CPL', lastName: 'NeedsCorrection', firstName: 'Pat', groupName: 'Outside Group' }
			]
		});
		expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
			records: [{ rank: 'CPL', lastName: 'NeedsCorrection', firstName: 'Pat', groupName: 'Alpha Team' }]
		});
	});

	it('invalidates refreshed personnel data when uploading another file after partial results', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ inserted: [{}], errors: [{ index: 1, message: 'Duplicate person' }] }), {
						status: 200
					})
			)
		);
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name'],
			['SGT', 'Smith', 'John'],
			['CPL', 'Taylor', 'Pat']
		]);
		renderPage();

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 2 Rows/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Import checked rows' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Upload another file' }));

		expect(invalidateAllMock).toHaveBeenCalled();
		expect(screen.getByText('Accepted headers')).toBeInTheDocument();
	});

	it('returns to the roster after import results', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ inserted: [{}], errors: [] }), { status: 200 }))
		);
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name'],
			['SGT', 'Smith', 'John']
		]);
		renderPage();

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Import checked rows' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Return to Personnel' }));

		expect(gotoMock).toHaveBeenCalledWith('/org/org-1/personnel', { invalidateAll: true });
	});

	it('cancels navigation attempts while an import is running', async () => {
		let resolveFetch: (response: Response) => void = () => {};
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						resolveFetch = resolve;
					})
			)
		);
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name'],
			['SGT', 'Smith', 'John']
		]);
		renderPage();

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Import checked rows' }));

		const beforeNavigateCallback = beforeNavigateMock.mock.calls.at(-1)?.[0] as
			| ((event: { cancel: () => void }) => void)
			| undefined;
		const cancel = vi.fn();
		beforeNavigateCallback?.({ cancel });

		expect(cancel).toHaveBeenCalledOnce();

		resolveFetch(new Response(JSON.stringify({ inserted: [{}], errors: [] }), { status: 200 }));
		await screen.findByText('Import complete');
	});
});
