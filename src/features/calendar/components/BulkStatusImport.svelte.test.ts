// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import BulkStatusImport from './BulkStatusImport.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import type { Personnel, StatusType } from '$lib/types';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function renderImporter({
	onComplete = vi.fn(),
	personnel = [
		{
			id: 'person-1',
			firstName: 'John',
			lastName: 'Smith',
			rank: 'SGT'
		}
	] as Personnel[],
	statusTypes = [
		{
			id: 'status-1',
			name: 'Leave',
			color: '#2563eb',
			textColor: '#ffffff'
		}
	] as StatusType[]
}: {
	onComplete?: () => void;
	personnel?: Personnel[];
	statusTypes?: StatusType[];
} = {}) {
	render(BulkStatusImport, {
		props: {
			personnel,
			statusTypes,
			onComplete
		}
	});
	return { onComplete };
}

describe('BulkStatusImport', () => {
	it('shows a success toast and notifies the parent after a successful import inserts rows', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
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

		const { onComplete } = renderImporter();

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
		expect(successToast).toHaveBeenCalledWith('Imported 1 status entry');
	});

	it('previews a single headerless pasted row', async () => {
		renderImporter();

		await fireEvent.input(screen.getByLabelText('Paste CSV data'), {
			target: {
				value: 'Smith,John,2026-01-01,2026-01-03,Leave'
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Parse' }));

		expect(await screen.findByRole('heading', { name: 'Review parsed rows' })).toBeTruthy();
		const nextButton = await screen.findByRole('button', { name: 'Next' });
		expect(nextButton.hasAttribute('disabled')).toBe(false);
	});

	it('previews a single headerless uploaded CSV row', async () => {
		renderImporter();
		const file = new File(['Smith,John,2026-01-01,2026-01-03,Leave'], 'status.csv', { type: 'text/csv' });

		await fireEvent.change(screen.getByLabelText('Upload a file'), {
			target: { files: [file] }
		});

		expect(await screen.findByRole('heading', { name: 'Review parsed rows' })).toBeTruthy();
		const nextButton = await screen.findByRole('button', { name: 'Next' });
		expect(nextButton.hasAttribute('disabled')).toBe(false);
	});

	it('shows a results failure and error toast when all import rows fail to insert', async () => {
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		const fetchMock = vi.fn(async () => {
			return {
				ok: false,
				json: async () => ({ inserted: [] })
			} as Response;
		});
		vi.stubGlobal('fetch', fetchMock);
		availabilityStore.load([], 'org-1');
		const { onComplete } = renderImporter();

		await fireEvent.input(screen.getByLabelText('Paste CSV data'), {
			target: {
				value: 'last name,first name,start date,end date,status\nSmith,John,2026-01-01,2026-01-03,Leave'
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Parse' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Next' }));

		expect(await screen.findByRole('heading', { name: 'Import complete' })).toBeTruthy();
		expect(screen.getByText(/failed to import/)).toBeTruthy();
		expect(errorToast).toHaveBeenCalledWith('No status entries were imported. Review the results and try again.');
		expect(onComplete).not.toHaveBeenCalled();
	});

	it('shows partial-success results without an error toast when some rows insert', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		const fetchMock = vi.fn(async () => {
			return {
				ok: true,
				json: async () => ({ inserted: [{ id: 'availability-1' }] })
			} as Response;
		});
		vi.stubGlobal('fetch', fetchMock);
		availabilityStore.load([], 'org-1');
		const { onComplete } = renderImporter({
			personnel: [
				{
					id: 'person-1',
					firstName: 'John',
					lastName: 'Smith',
					rank: 'SGT'
				},
				{
					id: 'person-2',
					firstName: 'Jane',
					lastName: 'Doe',
					rank: 'SSG'
				}
			] as Personnel[]
		});

		await fireEvent.input(screen.getByLabelText('Paste CSV data'), {
			target: {
				value:
					'last name,first name,start date,end date,status\nSmith,John,2026-01-01,2026-01-03,Leave\nDoe,Jane,2026-01-04,2026-01-05,Leave'
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Parse' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Next' }));

		expect(await screen.findByRole('heading', { name: 'Import complete' })).toBeTruthy();
		expect(screen.getByText(/status entry imported successfully/)).toBeTruthy();
		expect(screen.getByText(/failed to import/)).toBeTruthy();
		expect(successToast).toHaveBeenCalledWith('Imported 1 status entry');
		expect(errorToast).not.toHaveBeenCalled();
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

		renderImporter({
			personnel: [
				{
					id: 'person-1',
					firstName: 'John',
					lastName: 'Smith',
					rank: 'PFC'
				}
			] as Personnel[],
			onComplete
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
		await fireEvent.click(nextButton);
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
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(onComplete).toHaveBeenCalledTimes(1);
	});
});
