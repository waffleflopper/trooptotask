// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RatingSchemeEntryEditorData } from '$features/rating-scheme';
import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';
import EvaluationSheetTestDouble from './EvaluationSheetTestDouble.svelte';
import UpdateStatusPanel from './UpdateStatusPanel.svelte';

const ratingScheme = {
	id: 's1',
	ratedPersonId: 'p-patel',
	evalType: 'NCOER',
	archivedAt: null
} as RatingSchemeEntryEditorData['ratingScheme'];

const entry = {
	id: 'e1',
	ratingSchemeId: 's1',
	ratedPersonId: 'p-patel',
	evalType: 'NCOER',
	ratingPeriodEnd: '2026-09-30',
	workflowStatus: null,
	signedChain: null
} as RatingSchemeEntryEditorData['evaluation'];

/** The Needs You row a saved Evaluation becomes. */
const dueRow = ({ id, ratedPersonId, evalType, ratingPeriodEnd, workflowStatus }: typeof entry) => ({
	id,
	ratedPersonId,
	evalType,
	ratingPeriodEnd,
	workflowStatus
});

const respond = (body: unknown, status = 200) =>
	fetchMock.mockReturnValueOnce(Promise.resolve(new Response(JSON.stringify(body), { status })));

const fetchMock = vi.fn();

function open({
	personnelLookup = [] as RatingSchemeEntryEditorData['personnelLookup'],
	loadedEntries = [] as Record<string, unknown>[]
} = {}) {
	const updates = {
		refreshSummary: vi.fn(),
		refreshTaskings: vi.fn(),
		retryTaskings: vi.fn(),
		retryAdminAttention: vi.fn(),
		putRecord: vi.fn()
	};
	const close = vi.fn();
	const save = vi.fn((command: () => Promise<void>) => command());
	render(UpdateStatusPanel, {
		props: {
			model: {
				inputs: { page: { orgId: 'org-1', dashboard: { data: { ratingSchemeEntries: loadedEntries } } } }
			} as unknown as DashboardScreenModel,
			access: { can: () => true, isPrivileged: false },
			updates,
			save,
			saving: false,
			failure: null,
			close,
			orgId: 'org-1',
			editor: { ratingScheme, evaluation: entry, personnelLookup },
			Sheet: EvaluationSheetTestDouble as never
		}
	});
	return { updates, close, save };
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
	it('marks the evaluation completed and shows it on the page', async () => {
		const { updates } = open();
		respond({ evaluation: { ...entry, workflowStatus: 'completed', notes: 'kept out' }, moved: true });

		await fireEvent.click(screen.getByRole('button', { name: 'Mark completed' }));

		expect(await screen.findByText('Step: completed')).toBeTruthy();
		const [url, request] = fetchMock.mock.calls[0];
		expect([url, request.method, JSON.parse(request.body)]).toEqual([
			'/org/org-1/api/evaluations/e1/workflow',
			'POST',
			{ from: null, to: 'completed' }
		]);
		expect(updates.putRecord.mock.calls).toEqual([
			[
				'org-1',
				{
					list: 'ratingSchemeEntries',
					record: dueRow({ ...entry, workflowStatus: 'completed' })
				}
			]
		]);
	});

	it('saves a completing move through the row, which then leaves the queue', async () => {
		const { save } = open();
		respond({ evaluation: { ...entry, workflowStatus: 'completed' }, moved: true });

		await fireEvent.click(screen.getByRole('button', { name: 'Mark completed' }));

		expect(await screen.findByText('Step: completed')).toBeTruthy();
		expect(save).toHaveBeenCalledTimes(1);
	});

	it('keeps the panel open on a step that leaves the entry past thru', async () => {
		const { updates, save, close } = open();
		respond({ evaluation: { ...entry, workflowStatus: 'drafting' }, moved: true });

		await fireEvent.click(screen.getByRole('button', { name: 'Start tracking' }));

		expect(await screen.findByText('Step: drafting')).toBeTruthy();
		expect(updates.putRecord.mock.calls[0][1].record.workflowStatus).toBe('drafting');
		expect(save).not.toHaveBeenCalled();
		expect(close).not.toHaveBeenCalled();
	});

	it('saves only the fields the sheet changed, so a signed chain is never sent back', async () => {
		open();
		respond({ ...entry, notes: 'Updated' });

		await fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));

		expect(await screen.findByText('Sheet says: done')).toBeTruthy();
		const [url, request] = fetchMock.mock.calls[0];
		expect([url, request.method, JSON.parse(request.body)]).toEqual([
			'/org/org-1/api/evaluations',
			'PUT',
			{ id: 'e1', notes: 'Updated' }
		]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('keeps the rated person named when a save leaves the entry overdue', async () => {
		const { updates } = open({
			loadedEntries: [{ ...entry, ratedPersonName: 'SPC Patel, Ravi' }]
		});
		respond({ ...entry, notes: 'Updated' });

		await fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));

		await waitFor(() => expect(updates.putRecord).toHaveBeenCalledTimes(1));
		expect(updates.putRecord.mock.calls[0][1].record).toEqual({ ...dueRow(entry), ratedPersonName: 'SPC Patel, Ravi' });
	});

	it('names the rated person from the editor roster when it has them', async () => {
		const { updates } = open({
			personnelLookup: [{ id: 'p-patel', rank: 'SGT', lastName: 'Patel', firstName: 'Ravi' }],
			loadedEntries: [{ ...entry, ratedPersonName: 'SPC Patel, Ravi' }]
		});
		respond(entry);

		await fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));

		await waitFor(() => expect(updates.putRecord).toHaveBeenCalledTimes(1));
		expect(updates.putRecord.mock.calls[0][1].record.ratedPersonName).toBe('SGT Patel, Ravi');
	});

	it('shows the closed evaluation and its successor after a change of rater', async () => {
		const { updates } = open();
		respond({
			evaluation: { ...entry, ratingPeriodEnd: '2026-06-30', reportType: 'CR', workflowStatus: 'completed' },
			ratingScheme: { ...ratingScheme, raterName: 'SSG New' },
			successor: { ...entry, id: 'e2', ratingPeriodEnd: '2027-06-30', reportType: 'AN' }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Change rater' }));

		expect(await screen.findByText('Sheet says: done')).toBeTruthy();
		const [url, request] = fetchMock.mock.calls[0];
		expect([url, request.method, JSON.parse(request.body)]).toEqual([
			'/org/org-1/api/evaluations/e1/change-rater',
			'POST',
			{ changeDate: '2026-06-30', raterPersonId: null, raterName: 'SSG New' }
		]);
		expect(updates.putRecord.mock.calls.map(([, change]) => change.record)).toEqual([
			dueRow({ ...entry, ratingPeriodEnd: '2026-06-30', workflowStatus: 'completed' }),
			dueRow({ ...entry, id: 'e2', ratingPeriodEnd: '2027-06-30' })
		]);
	});

	it('hands a refused move back to the sheet and leaves the page unchanged', async () => {
		const { updates } = open();
		respond({ message: 'This evaluation has changed since you opened it. Refresh it and try again.' }, 409);

		await fireEvent.click(screen.getByRole('button', { name: 'Mark completed' }));

		expect(
			await screen.findByText('Sheet says: This evaluation has changed since you opened it. Refresh it and try again.')
		).toBeTruthy();
		expect(updates.putRecord).not.toHaveBeenCalled();
	});

	it('closes with the sheet', async () => {
		const { close } = open();

		await fireEvent.click(screen.getByRole('button', { name: 'Close evaluation' }));

		expect(close).toHaveBeenCalledTimes(1);
	});
});
