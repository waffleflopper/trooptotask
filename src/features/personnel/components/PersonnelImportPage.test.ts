// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PersonnelImportPage from './PersonnelImportPage.svelte';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import type { RankCatalogEntry } from '$lib/domain/rankCatalog';

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
	readOnly: boolean;
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

	it('renders a read-only disabled state without upload controls', () => {
		renderPage({ readOnly: true });

		expect(screen.getByText('Import disabled')).toBeInTheDocument();
		expect(screen.getByText('Import is disabled while this organization is read-only.')).toBeInTheDocument();
		expect(document.querySelector<HTMLInputElement>('#fileUpload')).toBeNull();
		expect(screen.queryByRole('button', { name: /Preview/i })).toBeNull();
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
		expect(screen.getByText(/not in the active Organization rank catalog/)).toBeInTheDocument();

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

	it('renders cap failures from a 200 response with targeted recovery copy', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							inserted: [],
							errors: [
								{
									index: 0,
									message: 'Personnel cap reached — upgrade or archive personnel before adding this record'
								}
							],
							capReached: true,
							capError: 'Personnel cap reached — upgrade or archive personnel before adding this record'
						}),
						{ status: 200 }
					)
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

		expect(await screen.findByText('Import failed')).toBeInTheDocument();
		expect(screen.getByText(/Your personnel limit has been reached/i)).toBeInTheDocument();
		expect(screen.getByText(/Archive personnel or upgrade your plan/i)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Review failed rows' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Upload another file' })).toBeInTheDocument();
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
