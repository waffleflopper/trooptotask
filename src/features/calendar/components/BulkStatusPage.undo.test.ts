// @vitest-environment happy-dom
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import BulkStatusPage from './BulkStatusPage.svelte';
import { invalidate } from '$app/navigation';
import { factories, offered, removedEntry } from '../test-support/BulkStatusRemoveUndoStub.svelte';
import { saves } from '../test-support/BulkStatusAddUndoStub.svelte';

const { pageMock } = vi.hoisted(() => ({
	pageMock: { url: new URL('http://localhost/org/org-1/calendar/bulk?tab=remove') }
}));

const access = createClientAccess(() => ({
	membershipRole: 'member',
	capabilityMap: createCapabilityMap('configure')
}));
const org = {
	orgUrlSegment: 'org-1',
	scopeSet: access.scopeSet,
	affordanceForFeatureAction: access.affordanceForFeatureAction
};

vi.mock('$app/state', () => ({ page: pageMock, navigating: { to: null } }));
vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidate: vi.fn(),
	invalidateAll: vi.fn(),
	afterNavigate: vi.fn()
}));
vi.mock('./BulkStatusRemove.svelte', async () => ({
	default: (await import('../test-support/BulkStatusRemoveUndoStub.svelte')).default
}));
vi.mock('./BulkStatusAdd.svelte', async () => ({
	default: (await import('../test-support/BulkStatusAddUndoStub.svelte')).default
}));
vi.mock('$features/calendar/stores/statusTypes.svelte', () => ({ statusTypesStore: { items: [] } }));
vi.mock('$features/calendar/stores/availability.svelte', () => ({
	availabilityStore: { items: [], addBatch: vi.fn(), removeBatch: vi.fn() }
}));
vi.mock('$features/personnel', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/personnel')>()),
	pinnedGroupsStore: { list: [] }
}));

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function renderPage() {
	return render(BulkStatusPage, {
		props: { org, data: { orgId: 'org-1', orgName: 'Test Unit', personnel: [], allPersonnel: [] } }
	});
}

describe('Undo offered by Bulk Status', () => {
	beforeEach(() => {
		cleanup();
		offered.length = 0;
		factories.length = 0;
		saves.length = 0;
		vi.mocked(invalidate).mockClear();
		fetchMock.mockReset();
		fetchMock.mockResolvedValue(Response.json({ removedIds: [], restoredIds: ['entry-1'], changedIds: [] }));
		vi.stubGlobal('fetch', fetchMock);
		pageMock.url = new URL('http://localhost/org/org-1/calendar/bulk?tab=remove');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('still puts the entries back after the page is replaced by the Calendar data refresh a save causes', async () => {
		const view = renderPage();
		view.unmount();

		offered[0].onClick();
		await flush();

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/org/org-1/api/availability/undo');
		expect(JSON.parse(String(init.body))).toEqual({ restore: [{ ...removedEntry }] });
	});

	it('stays silent once the reader is on another page', async () => {
		renderPage();
		pageMock.url = new URL('http://localhost/org/org-1/personnel');

		offered[0].onClick();
		await flush();

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('stays silent when a save that was pending as the reader left finishes on the next page', async () => {
		const view = renderPage();
		pageMock.url = new URL('http://localhost/org/org-1/personnel');
		view.unmount();

		factories[0]({ restore: [removedEntry] }).onClick();
		await flush();

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('stays silent once the reader is in another Organization', async () => {
		renderPage();
		pageMock.url = new URL('http://localhost/org/org-2/calendar/bulk?tab=remove');

		offered[0].onClick();
		await flush();

		expect(fetchMock).not.toHaveBeenCalled();
	});

	describe('after an Add prefilled from a Tasking', () => {
		const TASKING = '0e000000-0000-4000-8000-000000000001';
		const taskingPage = `http://localhost/org/org-1/calendar/taskings/${TASKING}`;
		const prefilled = `http://localhost/org/org-1/calendar/bulk?tab=add&tasking=${TASKING}&from=2030-10-19&to=2030-10-23`;

		it("works on the Tasking it returns to and rereads that Tasking's coverage", async () => {
			pageMock.url = new URL(prefilled);
			renderPage();
			const undo = await saves[0]();
			pageMock.url = new URL(taskingPage);

			undo.onClick();
			await vi.waitFor(() => expect(invalidate).toHaveBeenCalledWith('app:calendar-events'));

			expect(fetchMock).toHaveBeenCalledOnce();
			expect(invalidate).toHaveBeenCalledWith('app:calendar-data');
		});

		it('stays silent once the reader leaves that Tasking for another page', async () => {
			pageMock.url = new URL(prefilled);
			renderPage();
			const undo = await saves[0]();
			pageMock.url = new URL('http://localhost/org/org-1/dashboard');

			undo.onClick();
			await flush();

			expect(fetchMock).not.toHaveBeenCalled();
		});
	});
});
