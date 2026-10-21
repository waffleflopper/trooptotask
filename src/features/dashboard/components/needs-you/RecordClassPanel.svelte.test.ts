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

function record(personnelId: string) {
	return { id: `t-${personnelId}`, personnelId, trainingTypeId: 'sharp', completionDate: '2026-10-21' };
}

const fetchMock = vi.fn();

function open() {
	const updates = { refreshSummary: vi.fn(), putRecord: vi.fn() };
	const close = vi.fn();
	render(RecordClassPanel, {
		props: {
			model: {} as DashboardScreenModel,
			access: { can: () => true },
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
	it('records the class in one request, refreshes the summary without the recorded people, and closes', async () => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ inserted: people.map((p) => record(p.id)), updated: [], exempted: [], errors: [] }))
		);
		const { updates, close } = open();

		await fireEvent.click(screen.getByRole('button', { name: 'Record 3' }));

		await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe('/org/org-1/api/personnel-trainings/batch');
		expect(updates.refreshSummary.mock.calls).toEqual([
			[
				{
					orgId: 'org-1',
					change: { trainingTypeId: 'sharp', recordedPersonnelIds: ['p-okafor', 'p-brooks', 'p-liang'] }
				}
			]
		]);
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
		expect(updates.refreshSummary.mock.calls).toEqual([
			[{ orgId: 'org-1', change: { trainingTypeId: 'sharp', recordedPersonnelIds: ['p-okafor', 'p-brooks'] } }]
		]);
	});

	it('shows a denied request in the dialog and changes nothing on the page', async () => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ message: 'Recording training is not allowed' }), { status: 403 })
		);
		const { updates } = open();

		await fireEvent.click(screen.getByRole('button', { name: 'Record 3' }));

		expect(await screen.findByText('Recording training is not allowed')).toBeTruthy();
		expect(updates.refreshSummary).not.toHaveBeenCalled();
	});
});
