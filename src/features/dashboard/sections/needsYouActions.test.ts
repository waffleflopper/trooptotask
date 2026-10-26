// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { DashboardInputs } from './dashboardInputs';
import { awardStartedAction, updateStatusAction } from './needsYouActions';

const inputs = { today: '2026-10-21', page: { orgId: 'org-1' } } as DashboardInputs;
const patel = { id: 'p-patel', groupId: 'bravo', lastName: 'Patel' } as Personnel;

const fetchMock = vi.fn();

function respond(body: unknown, status = 200) {
	return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('Award started', () => {
	it('records the acknowledgement, then shows it on the page', async () => {
		const action = awardStartedAction(inputs, patel);
		if (action.mode !== 'run') throw new Error('Award started runs in place');
		const updates = { refreshSummary: vi.fn(), refreshTaskings: vi.fn(), retryTaskings: vi.fn(), putRecord: vi.fn() };
		fetchMock.mockReturnValueOnce(respond({ acknowledged: true }));

		await action.run(updates);

		const [url, request] = fetchMock.mock.calls[0];
		expect([url, request.method, JSON.parse(request.body)]).toEqual([
			'/org/org-1/api/personnel/p-patel/award-tracking',
			'POST',
			{ acknowledged: true }
		]);
		expect(updates.putRecord).toHaveBeenCalledWith('org-1', {
			list: 'awardTrackingAcknowledgedPersonnelIds',
			personnelId: 'p-patel'
		});
	});

	it('fails with the server message and leaves the page unchanged', async () => {
		const action = awardStartedAction(inputs, patel);
		if (action.mode !== 'run') throw new Error('Award started runs in place');
		const updates = { refreshSummary: vi.fn(), refreshTaskings: vi.fn(), retryTaskings: vi.fn(), putRecord: vi.fn() };
		fetchMock.mockReturnValueOnce(respond({ message: 'Forbidden' }, 403));

		await expect(action.run(updates)).rejects.toThrow('Forbidden');
		expect(updates.putRecord).not.toHaveBeenCalled();
	});
});

describe('Update status', () => {
	it('reads the entry and its people when it opens', async () => {
		const action = updateStatusAction(inputs, 'e1');
		if (action.mode !== 'dialog') throw new Error('Update status opens a dialog');
		const editor = { entry: { id: 'e1', ratedPersonId: 'p-patel' }, personnelLookup: [{ id: 'p-patel' }] };
		fetchMock.mockReturnValueOnce(respond(editor));

		const panel = await action.open();

		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/org/org-1/api/rating-scheme?entry=e1']);
		expect(panel.props).toMatchObject({ orgId: 'org-1', editor });
	});

	it('does not open when the entry cannot be read', async () => {
		const action = updateStatusAction(inputs, 'e1');
		if (action.mode !== 'dialog') throw new Error('Update status opens a dialog');
		fetchMock.mockReturnValueOnce(respond({ message: 'Rating Scheme entry not found' }, 404));

		await expect(action.open()).rejects.toThrow('Rating Scheme entry not found');
	});
});
