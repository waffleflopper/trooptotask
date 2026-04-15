// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BulkPersonnelMerge from './BulkPersonnelMerge.svelte';

const { parseCSVTextMock, parseFileMock } = vi.hoisted(() => ({
	parseCSVTextMock: vi.fn(),
	parseFileMock: vi.fn()
}));

vi.mock('$lib/utils/csvParser', () => ({
	parseCSVText: parseCSVTextMock,
	parseFile: parseFileMock
}));

describe('BulkPersonnelMerge', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		parseFileMock.mockResolvedValue([]);
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('submits merge rows to the dedicated merge endpoint and renders the results summary', async () => {
		parseCSVTextMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'ETS'],
			['SGT', 'Smith', 'Jamie', '2027-05-01']
		]);
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				matched: [{ index: 0, personnelId: 'person-1' }],
				updated: [{ id: 'person-1', ets: '2027-05-01', deros: null }],
				skipped: [{ index: 1, message: 'Matched personnel already has the requested values' }],
				ambiguous: [{ index: 2, message: 'Multiple personnel rows matched this record' }],
				errors: [{ index: 3, message: 'No active personnel row matched this record' }]
			})
		} as Response);

		render(BulkPersonnelMerge, {
			props: {
				orgId: 'org-1',
				groups: [],
				personnel: [
					{
						id: 'person-1',
						rank: 'SGT',
						lastName: 'Smith',
						firstName: 'Jamie',
						mos: '68W',
						clinicRole: 'Medic',
						groupId: null,
						groupName: '',
						ets: null,
						deros: null,
						archivedAt: null
					}
				],
				onComplete: vi.fn()
			}
		});

		await fireEvent.input(screen.getByLabelText('Personnel Data'), {
			target: {
				value: 'Rank, Last Name, First Name, ETS\nSGT, Smith, Jamie, 2027-05-01'
			}
		});

		await waitFor(() => expect(screen.getByRole('button', { name: /Preview 1 Rows/i })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /Preview 1 Rows/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Apply Updates' }));

		await waitFor(() => {
			expect(globalThis.fetch).toHaveBeenCalledWith('/org/org-1/api/personnel/merge', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'Jamie', ets: '2027-05-01' }]
				})
			});
		});

		const matchedCard = (await screen.findByText('person rows found')).closest('.summary-card');
		const updatedCard = screen.getByText('values changed').closest('.summary-card');
		const skippedCard = screen.getByText('skipped').closest('.summary-card');
		const ambiguousCard = screen.getByText('ambiguous').closest('.summary-card');
		const failedCard = screen.getByText('failed').closest('.summary-card');
		expect(
			screen.getByText('Found rows can be higher than changed rows when values are already current.')
		).toBeTruthy();
		expect(screen.getByText('person rows found')).toBeTruthy();
		expect(screen.getByText('values changed')).toBeTruthy();

		expect(matchedCard?.textContent).toContain('1');
		expect(updatedCard?.textContent).toContain('1');
		expect(skippedCard?.textContent).toContain('1');
		expect(ambiguousCard?.textContent).toContain('1');
		expect(failedCard?.textContent).toContain('1');
	});

	it('shows parsed error details for a non-ok JSON response without surfacing success counts', async () => {
		parseCSVTextMock.mockResolvedValue([
			['Rank', 'Last Name', 'First Name', 'ETS'],
			['SGT', 'Smith', 'Jamie', '2027-05-01']
		]);
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: false,
			status: 403,
			statusText: 'Forbidden',
			json: async () => ({
				message: 'Read-only access denied',
				matched: [{ index: 0, personnelId: 'person-1' }],
				updated: [{ id: 'person-1', ets: '2027-05-01', deros: null }]
			})
		} as Response);

		render(BulkPersonnelMerge, {
			props: {
				orgId: 'org-1',
				groups: [],
				personnel: [
					{
						id: 'person-1',
						rank: 'SGT',
						lastName: 'Smith',
						firstName: 'Jamie',
						mos: '68W',
						clinicRole: 'Medic',
						groupId: null,
						groupName: '',
						ets: null,
						deros: null,
						archivedAt: null
					}
				],
				onComplete: vi.fn()
			}
		});

		await fireEvent.input(screen.getByLabelText('Personnel Data'), {
			target: {
				value: 'Rank, Last Name, First Name, ETS\nSGT, Smith, Jamie, 2027-05-01'
			}
		});

		await waitFor(() => expect(screen.getByRole('button', { name: /Preview 1 Rows/i })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /Preview 1 Rows/i }));
		await fireEvent.click(screen.getByRole('button', { name: 'Apply Updates' }));

		await waitFor(() => {
			expect(globalThis.fetch).toHaveBeenCalledWith('/org/org-1/api/personnel/merge', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'Jamie', ets: '2027-05-01' }]
				})
			});
		});

		expect(await screen.findByText('Read-only access denied')).toBeTruthy();
		expect(screen.getByText('person rows found').closest('.summary-card')?.textContent).toContain('0');
		expect(screen.getByText('values changed').closest('.summary-card')?.textContent).toContain('0');
		expect(screen.getByText('failed').closest('.summary-card')?.textContent).toContain('1');
		expect(screen.queryByText('matched')).toBeNull();
		expect(screen.queryByText('updated')).toBeNull();
	});
});
