// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PersonnelImportPage from './PersonnelImportPage.svelte';

const { gotoMock, invalidateAllMock, parseFileMock } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	invalidateAllMock: vi.fn(),
	parseFileMock: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	invalidateAll: invalidateAllMock
}));

vi.mock('$lib/utils/csvParser', () => ({
	parseFile: parseFileMock
}));

function renderPage() {
	return render(PersonnelImportPage, {
		props: {
			groups: [{ id: 'group-1', name: 'Alpha Team', sortOrder: 0 }],
			orgId: 'org-1',
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
			]
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

	it('sends ETS and PCS / DEROS through the regular import batch payload', async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ inserted: [{}], errors: [] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'MOS', 'Duty Role', 'Group', 'ETS', 'PCS / DEROS'],
			['SGT', 'Smith', 'John', '68W', 'Medic', 'Alpha Team', '2027-05-01', '2026-11-30']
		]);
		renderPage();

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		expect(input).toBeTruthy();
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));
		await waitFor(() => expect(screen.getByDisplayValue('2027-05-01')).toBeTruthy());

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
		expect(within(table).getByText(/will import as unassigned/i)).toBeInTheDocument();
		expect(screen.getByRole('checkbox', { name: /Select import row 2: Resolve row errors/i })).toBeDisabled();
		expect(screen.getAllByText('2 of 3 selected').length).toBeGreaterThan(0);

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select import row 3' }));
		expect(screen.getAllByText('1 of 3 selected').length).toBeGreaterThan(0);
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

		expect(invalidateAllMock).toHaveBeenCalled();
		expect(gotoMock).toHaveBeenCalledWith('/org/org-1/personnel');
	});
});
