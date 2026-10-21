// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RatingSchemeEntryEditorData } from '$features/rating-scheme';
import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';
import EntryModalTestDouble from './EntryModalTestDouble.svelte';
import UpdateStatusPanel from './UpdateStatusPanel.svelte';

const entry = {
	id: 'e1',
	ratedPersonId: 'p-patel',
	evalType: 'NCOER',
	ratingPeriodEnd: '2026-09-30',
	status: 'active'
} as RatingSchemeEntryEditorData['entry'];

const fetchMock = vi.fn();

function open() {
	const updates = { refreshSummary: vi.fn(), putRecord: vi.fn() };
	const close = vi.fn();
	render(UpdateStatusPanel, {
		props: {
			model: { inputs: { page: { orgId: 'org-1' } } } as DashboardScreenModel,
			access: { can: () => true },
			updates,
			save: (command: () => Promise<void>) => command(),
			saving: false,
			failure: null,
			close,
			orgId: 'org-1',
			editor: { entry, personnelLookup: [] },
			Modal: EntryModalTestDouble as never
		}
	});
	return { updates, close };
}

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('UpdateStatusPanel', () => {
	it('saves the entry and shows the saved status on the page', async () => {
		const { updates } = open();
		fetchMock.mockReturnValueOnce(
			Promise.resolve(new Response(JSON.stringify({ ...entry, status: 'completed', notes: 'kept out' })))
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Mark completed' }));

		await waitFor(() => expect(updates.putRecord).toHaveBeenCalledTimes(1));
		const [url, request] = fetchMock.mock.calls[0];
		expect([url, request.method, JSON.parse(request.body)]).toEqual([
			'/org/org-1/api/rating-scheme',
			'PUT',
			{ id: 'e1', status: 'completed' }
		]);
		expect(updates.putRecord).toHaveBeenCalledWith('org-1', {
			list: 'ratingSchemeEntries',
			record: {
				id: 'e1',
				ratedPersonId: 'p-patel',
				evalType: 'NCOER',
				ratingPeriodEnd: '2026-09-30',
				status: 'completed'
			}
		});
	});

	it('hands a failed save back to the editor and leaves the page unchanged', async () => {
		const { updates } = open();
		fetchMock.mockReturnValueOnce(
			Promise.resolve(new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }))
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Mark completed' }));

		expect(await screen.findByText('Modal says: Forbidden')).toBeTruthy();
		expect(updates.putRecord).not.toHaveBeenCalled();
	});

	it('closes with the editor', async () => {
		const { close } = open();

		await fireEvent.click(screen.getByRole('button', { name: 'Close entry' }));

		expect(close).toHaveBeenCalledTimes(1);
	});
});
