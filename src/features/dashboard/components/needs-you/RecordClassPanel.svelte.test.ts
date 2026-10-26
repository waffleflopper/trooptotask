// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import { loadRecordClassDialog, type TrainingType } from '$features/training';
import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';
import RecordClassPanel from './RecordClassPanel.svelte';

const { default: RecordClassDialog } = await loadRecordClassDialog();

function person(id: string, lastName: string): Personnel {
	return { id, rank: 'SPC', lastName, firstName: 'Ana', mos: '', clinicRole: '', groupId: null, groupName: '' };
}

const sharp = {
	id: 'sharp',
	name: 'SHARP',
	expirationMonths: 12,
	expirationDateOnly: false
} as TrainingType;

const people = [person('p-okafor', 'Okafor'), person('p-brooks', 'Brooks'), person('p-liang', 'Liang')];

function record(personnelId: string, expirationDate: string | null = '2027-10-21') {
	return { id: `t-${personnelId}`, personnelId, trainingTypeId: 'sharp', completionDate: '2026-10-21', expirationDate };
}

const fetchMock = vi.fn();

function open() {
	const updates = { refreshSummary: vi.fn(), refreshTaskings: vi.fn(), retryTaskings: vi.fn(), putRecord: vi.fn() };
	const close = vi.fn();
	render(RecordClassPanel, {
		props: {
			model: {} as DashboardScreenModel,
			access: { can: () => true, isPrivileged: false },
			updates,
			save: (command: () => Promise<void>) => command(),
			saving: false,
			failure: null,
			close,
			orgId: 'org-1',
			trainingType: sharp,
			people,
			today: '2026-10-21',
			Dialog: RecordClassDialog
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

describe('RecordClassPanel', () => {
	it('records the class in one request, takes the recorded people off the row, refreshes the summary, and closes', async () => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ inserted: people.map((p) => record(p.id)), updated: [], exempted: [], errors: [] }))
		);
		const { updates, close } = open();

		await fireEvent.click(screen.getByRole('button', { name: 'Record 3' }));

		await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe('/org/org-1/api/personnel-trainings/batch');
		expect(updates.putRecord.mock.calls).toEqual([
			[
				'org-1',
				{ list: 'trainingCompletions', trainingTypeId: 'sharp', personnelIds: ['p-okafor', 'p-brooks', 'p-liang'] }
			]
		]);
		expect(updates.refreshSummary).toHaveBeenCalledTimes(1);
	});

	it('keeps a person whose new record is already expired on the row until the summary says otherwise', async () => {
		fetchMock.mockResolvedValue(
			new Response(
				JSON.stringify({
					inserted: [record('p-okafor'), record('p-brooks', '2026-10-20'), record('p-liang', null)],
					updated: [],
					exempted: [],
					errors: []
				})
			)
		);
		const { updates, close } = open();

		await fireEvent.click(screen.getByRole('button', { name: 'Record 3' }));

		await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
		expect(updates.putRecord.mock.calls).toEqual([
			['org-1', { list: 'trainingCompletions', trainingTypeId: 'sharp', personnelIds: ['p-okafor', 'p-liang'] }]
		]);
		expect(updates.refreshSummary).toHaveBeenCalledTimes(1);
	});

	it('removes the people it recorded and keeps the dialog open naming the ones it could not', async () => {
		fetchMock.mockResolvedValue(
			new Response(
				JSON.stringify({
					inserted: [record('p-okafor')],
					updated: [record('p-brooks')],
					exempted: [],
					errors: [{ index: 2, message: 'Person is outside your scope' }]
				})
			)
		);
		const { updates, close } = open();

		await fireEvent.click(screen.getByRole('button', { name: 'Record 3' }));

		expect(await screen.findByText('1 not recorded. Liang: Person is outside your scope')).toBeTruthy();
		expect(close).not.toHaveBeenCalled();
		expect(updates.putRecord.mock.calls).toEqual([
			['org-1', { list: 'trainingCompletions', trainingTypeId: 'sharp', personnelIds: ['p-okafor', 'p-brooks'] }]
		]);
		expect(updates.refreshSummary).toHaveBeenCalledTimes(1);
	});

	it('shows a denied request in the dialog and changes nothing on the page', async () => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ message: 'Recording training is not allowed' }), { status: 403 })
		);
		const { updates } = open();

		await fireEvent.click(screen.getByRole('button', { name: 'Record 3' }));

		expect(await screen.findByText('Recording training is not allowed')).toBeTruthy();
		expect(updates.refreshSummary).not.toHaveBeenCalled();
		expect(updates.putRecord).not.toHaveBeenCalled();
	});
});
