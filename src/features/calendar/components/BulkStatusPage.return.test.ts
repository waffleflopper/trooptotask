// @vitest-environment happy-dom
import { createClientAccess } from '$lib/access/clientAccess';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import BulkStatusPage from './BulkStatusPage.svelte';

const { gotoMock, invalidateMock, pageMock, navigatingMock, addBatchMock } = vi.hoisted(() => ({
	addBatchMock: vi.fn(async () => [{ personnelId: 'person-1' }]),
	gotoMock: vi.fn(),
	invalidateMock: vi.fn(),
	pageMock: { url: new URL('http://localhost/org/org-1/calendar/bulk?tab=add') },
	navigatingMock: { to: null as { url: URL } | null }
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

vi.mock('$app/navigation', () => ({ goto: gotoMock, invalidate: invalidateMock, invalidateAll: vi.fn() }));
vi.mock('$app/state', () => ({ page: pageMock, navigating: navigatingMock }));
vi.mock('./BulkStatusAdd.svelte', async () => ({
	default: (await import('../test-support/BulkStatusAddFinishStub.svelte')).default
}));
vi.mock('./BulkStatusRemove.svelte', async () => ({
	default: (await import('../test-support/BulkStatusRemoveFinishStub.svelte')).default
}));
vi.mock('$features/calendar/stores/statusTypes.svelte', () => ({ statusTypesStore: { items: [] } }));
vi.mock('$features/calendar/stores/availability.svelte', () => ({
	availabilityStore: { items: [], addBatch: addBatchMock, removeBatch: vi.fn() }
}));
vi.mock('$features/personnel', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/personnel')>()),
	pinnedGroupsStore: { list: [] }
}));

const TASKING = '00000000-0000-4000-8000-000000000101';

function renderPage(disabledFeatures?: readonly FeatureKey[]) {
	return render(BulkStatusPage, {
		props: { org, data: { orgId: 'org-1', orgName: 'Test Unit', personnel: [], allPersonnel: [], disabledFeatures } }
	});
}

describe('BulkStatusPage after a prefilled save', () => {
	beforeEach(() => {
		cleanup();
		gotoMock.mockReset().mockResolvedValue(undefined);
		invalidateMock.mockReset().mockResolvedValue(undefined);
		navigatingMock.to = null;
	});

	it('lands back on the Tasking and refreshes the Calendar data as part of leaving', async () => {
		pageMock.url = new URL(
			`http://localhost/org/org-1/calendar/bulk?tab=add&tasking=${TASKING}&from=2030-10-19&to=2030-10-23`
		);
		renderPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

		await waitFor(() => expect(gotoMock).toHaveBeenCalled());
		expect(gotoMock).toHaveBeenCalledExactlyOnceWith(`/org/org-1/calendar/taskings/${TASKING}`, {
			invalidate: ['app:calendar-data']
		});
		expect(invalidateMock).not.toHaveBeenCalled();
	});

	it('leaves a navigation the reader started during the save alone', async () => {
		pageMock.url = new URL(
			`http://localhost/org/org-1/calendar/bulk?tab=add&tasking=${TASKING}&from=2030-10-19&to=2030-10-23`
		);
		renderPage();
		navigatingMock.to = { url: new URL('http://localhost/org/org-1/personnel') };

		await fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
		await Promise.resolve();

		expect(gotoMock).not.toHaveBeenCalled();
		expect(invalidateMock).not.toHaveBeenCalled();
	});

	it('does not return from a save whose form was replaced by a tab switch', async () => {
		pageMock.url = new URL(
			`http://localhost/org/org-1/calendar/bulk?tab=add&tasking=${TASKING}&from=2030-10-19&to=2030-10-23`
		);
		let finishSave = () => {};
		addBatchMock.mockImplementationOnce(
			() => new Promise((resolve) => (finishSave = () => resolve([{ personnelId: 'person-1' }])))
		);
		renderPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
		await fireEvent.click(screen.getByRole('radio', { name: 'Remove' }));
		finishSave();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(gotoMock).not.toHaveBeenCalledWith(`/org/org-1/calendar/taskings/${TASKING}`, expect.anything());
	});

	it('refreshes the Calendar data after a removal, including one reached by switching tabs', async () => {
		pageMock.url = new URL('http://localhost/org/org-1/calendar/bulk?tab=add');
		const view = renderPage();
		await fireEvent.click(screen.getByRole('radio', { name: 'Remove' }));
		pageMock.url = new URL('http://localhost/org/org-1/calendar/bulk?tab=remove');
		view.unmount();
		renderPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Finish removal' }));

		expect(invalidateMock).toHaveBeenCalledWith('app:calendar-data');
	});

	it('ignores the prefill while Events & Taskings is off', async () => {
		pageMock.url = new URL(
			`http://localhost/org/org-1/calendar/bulk?tab=add&tasking=${TASKING}&from=2030-10-19&to=2030-10-23`
		);
		renderPage(['eventsAndTaskings']);

		await fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

		await waitFor(() => expect(invalidateMock).toHaveBeenCalledWith('app:calendar-data'));
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('stays on Bulk Status when nothing asked for a return', async () => {
		pageMock.url = new URL('http://localhost/org/org-1/calendar/bulk?tab=add');
		renderPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

		await waitFor(() => expect(invalidateMock).toHaveBeenCalledWith('app:calendar-data'));
		expect(gotoMock).not.toHaveBeenCalled();
	});
});
