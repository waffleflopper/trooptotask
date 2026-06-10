// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import BulkStatusImport from './BulkStatusImport.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import type { Personnel, StatusType } from '$lib/types';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('BulkStatusImport', () => {
	it('notifies the parent after a successful import inserts rows', async () => {
		const onComplete = vi.fn();
		const fetchMock = vi.fn(async () => {
			return {
				ok: true,
				json: async () => ({ inserted: [{ id: 'availability-1' }] })
			} as Response;
		});
		vi.stubGlobal('fetch', fetchMock);
		// Submission goes through the availability store's batch seam, which resolves its
		// endpoint from the loaded org.
		availabilityStore.load([], 'org-1');

		render(BulkStatusImport, {
			props: {
				personnel: [
					{
						id: 'person-1',
						firstName: 'John',
						lastName: 'Smith',
						rank: 'SGT'
					}
				] as Personnel[],
				statusTypes: [
					{
						id: 'status-1',
						name: 'Leave',
						color: '#2563eb',
						textColor: '#ffffff'
					}
				] as StatusType[],
				onComplete
			}
		});

		await fireEvent.input(screen.getByLabelText('Paste CSV data'), {
			target: {
				value: 'last name,first name,start date,end date,status\nSmith,John,2026-01-01,2026-01-03,Leave'
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Parse' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Next' }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/availability/batch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					records: [
						{
							personnelId: 'person-1',
							statusTypeId: 'status-1',
							startDate: '2026-01-01',
							endDate: '2026-01-03',
							note: null
						}
					]
				})
			});
		});
		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	it('shows a rank-conflict warning and still imports the row against the matched person', async () => {
		const onComplete = vi.fn();
		const fetchMock = vi.fn(async () => {
			return {
				ok: true,
				json: async () => ({ inserted: [{ id: 'availability-1' }] })
			} as Response;
		});
		vi.stubGlobal('fetch', fetchMock);
		availabilityStore.load([], 'org-1');

		render(BulkStatusImport, {
			props: {
				personnel: [
					{
						id: 'person-1',
						firstName: 'John',
						lastName: 'Smith',
						rank: 'PFC'
					}
				] as Personnel[],
				statusTypes: [
					{
						id: 'status-1',
						name: 'Leave',
						color: '#2563eb',
						textColor: '#ffffff'
					}
				] as StatusType[],
				onComplete
			}
		});

		await fireEvent.input(screen.getByLabelText('Paste CSV data'), {
			target: {
				value: 'last name,first name,rank,start date,end date,status\nSmith,John,SGT,2026-01-01,2026-01-03,Leave'
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Parse' }));

		// The rank-conflict warning copy renders on the preview row.
		expect(await screen.findByText(/roster rank/)).toBeTruthy();

		// The warning row stays selectable, so Next is enabled and the import proceeds
		// against the matched person despite the contradicting rank.
		const nextButton = await screen.findByRole('button', { name: 'Next' });
		expect(nextButton.hasAttribute('disabled')).toBe(false);
		await fireEvent.click(nextButton);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				'/org/org-1/api/availability/batch',
				expect.objectContaining({
					body: JSON.stringify({
						records: [
							{
								personnelId: 'person-1',
								statusTypeId: 'status-1',
								startDate: '2026-01-01',
								endDate: '2026-01-03',
								note: null
							}
						]
					})
				})
			);
		});
		expect(onComplete).toHaveBeenCalledTimes(1);
	});
});
