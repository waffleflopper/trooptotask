// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BulkPersonnelManager from './BulkPersonnelManager.svelte';

const { parseFileMock } = vi.hoisted(() => ({
	parseFileMock: vi.fn()
}));

vi.mock('$lib/utils/csvParser', () => ({
	parseFile: parseFileMock
}));

function renderManager() {
	return render(BulkPersonnelManager, {
		props: {
			personnelByGroup: [],
			groups: [{ id: 'group-1', name: 'Alpha Team', sortOrder: 0 }],
			orgId: 'org-1',
			onImportComplete: vi.fn(),
			onBulkDelete: vi.fn(),
			onClose: vi.fn()
		}
	});
}

describe('BulkPersonnelManager', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		parseFileMock.mockResolvedValue([]);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('uses uploaded files as the only import input source', async () => {
		parseFileMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'MOS', 'Duty Role', 'Group', 'ETS', 'PCS / DEROS'],
			['SGT', 'Smith', 'John', '68W', 'Medic', 'Alpha Team', '2027-05-01', '2026-11-30']
		]);
		renderManager();

		expect(screen.queryByText(/or paste text/i)).toBeNull();
		expect(screen.queryByText('Paste Data')).toBeNull();
		expect(screen.queryByLabelText('Personnel Data')).toBeNull();
		expect(
			screen.getByText('Columns: Rank, Last Name, First Name, MOS, Duty Role, Group, ETS, PCS / DEROS')
		).toBeTruthy();

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
		renderManager();

		const input = document.querySelector<HTMLInputElement>('#fileUpload');
		expect(input).toBeTruthy();
		await fireEvent.change(input!, {
			target: { files: [new File(['records'], 'personnel.csv', { type: 'text/csv' })] }
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Preview 1 Rows/i }));
		await waitFor(() => expect(screen.getByText('2027-05-01')).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: 'Import Records' }));

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

	it('renders archive personnel rows after switching tabs', async () => {
		render(BulkPersonnelManager, {
			props: {
				personnelByGroup: [
					{
						group: 'Leadership',
						personnel: [
							{
								id: 'p1',
								firstName: 'Jamie',
								lastName: 'Smith',
								rank: 'SGT',
								mos: '68W',
								clinicRole: 'Medic',
								groupId: 'g1',
								groupName: 'Leadership',
								archivedAt: null
							}
						]
					}
				],
				groups: [{ id: 'g1', name: 'Leadership', sortOrder: 0 }],
				orgId: 'org-1',
				onImportComplete: vi.fn(),
				onBulkDelete: vi.fn(),
				onClose: vi.fn()
			}
		});

		await fireEvent.click(screen.getByRole('tab', { name: 'Archive' }));

		expect(screen.getByRole('searchbox')).toBeTruthy();
		expect(screen.getAllByText('Leadership').length).toBeGreaterThan(0);
		expect(screen.getByText('Smith, Jamie')).toBeTruthy();
		expect(screen.getByText('Medic')).toBeTruthy();
	});

	it('shows a dedicated merge workflow tab for ETS and PCS / DEROS backfills', async () => {
		renderManager();

		await fireEvent.click(screen.getByRole('tab', { name: 'Backfill ETS/DEROS' }));

		expect(screen.getByText('Bulk Update Existing Personnel')).toBeTruthy();
		expect(screen.getByText(/Matching uses exact Rank \+ Last Name \+ First Name/i)).toBeTruthy();
	});

	it('keeps the import preview action in the dialog footer', () => {
		renderManager();

		expect(screen.getByRole('button', { name: /Preview Rows/i })).toBeTruthy();
	});

	it('keeps the ETS and DEROS backfill preview action in the dialog footer', async () => {
		renderManager();

		await fireEvent.click(screen.getByRole('tab', { name: 'Backfill ETS/DEROS' }));

		expect(screen.getByRole('button', { name: /Preview Rows/i })).toBeTruthy();
	});
});
