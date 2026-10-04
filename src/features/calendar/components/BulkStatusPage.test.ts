// @vitest-environment happy-dom
import { createClientAccess, type ClientAccessFacts } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/svelte';
import BulkStatusPage from './BulkStatusPage.svelte';

const { gotoMock, loadCalendarRangeMock, mergeCalendarRangeIntoStoresMock, pageMock } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	loadCalendarRangeMock: vi.fn(),
	mergeCalendarRangeIntoStoresMock: vi.fn(),
	pageMock: {
		url: new URL('http://localhost/org/org-1/calendar/bulk?tab=add')
	}
}));

let accessFacts: ClientAccessFacts = { membershipRole: 'owner' };
let orgUrlSegment = 'org-1';
const access = createClientAccess(() => accessFacts);
const org = {
	get orgUrlSegment() {
		return orgUrlSegment;
	},
	get scopeSet() {
		return access.scopeSet;
	},
	affordanceForFeatureAction: access.affordanceForFeatureAction
};

vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	invalidate: vi.fn(),
	invalidateAll: vi.fn()
}));

vi.mock('$app/state', () => ({
	page: pageMock
}));

vi.mock('./BulkStatusAdd.svelte', async () => ({
	default: (await import('$lib/test-stubs/VisibleStub.svelte')).default
}));

vi.mock('./BulkStatusRemove.svelte', async () => ({
	default: (await import('$lib/test-stubs/BulkStatusRemoveLoadRangeStub.svelte')).default
}));

vi.mock('./BulkStatusImport.svelte', async () => ({
	default: (await import('$lib/test-stubs/VisibleStub.svelte')).default
}));

vi.mock('$features/calendar/stores/statusTypes.svelte', () => ({
	statusTypesStore: { items: [] }
}));

vi.mock('$features/calendar/stores/availability.svelte', () => ({
	availabilityStore: { items: [], addBatch: vi.fn(), removeBatch: vi.fn() }
}));

vi.mock('$features/calendar/utils/calendarRangeLoader', () => ({
	loadCalendarRange: loadCalendarRangeMock,
	mergeCalendarRangeIntoStores: mergeCalendarRangeIntoStoresMock
}));

vi.mock('$features/personnel', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/personnel')>()),
	pinnedGroupsStore: { list: [] }
}));

function renderPage(orgId = 'org-1') {
	return render(BulkStatusPage, {
		props: {
			org,
			data: {
				orgId,
				orgName: 'Test Unit',
				personnel: [],
				allPersonnel: []
			}
		}
	});
}

describe('BulkStatusPage', () => {
	beforeEach(() => {
		cleanup();
		gotoMock.mockReset();
		loadCalendarRangeMock.mockReset();
		loadCalendarRangeMock.mockResolvedValue({
			rangeStart: '2026-01-01',
			rangeEnd: '2026-01-31',
			availabilityEntries: [],
			specialDays: [],
			dailyAssignments: []
		});
		mergeCalendarRangeIntoStoresMock.mockReset();
		pageMock.url = new URL('http://localhost/org/org-1/calendar/bulk?tab=add');
		orgUrlSegment = 'org-1';
		accessFacts = { membershipRole: 'member', capabilityMap: createCapabilityMap('configure') };
	});

	it('preserves the permission gate when availability operation is denied', () => {
		accessFacts = { membershipRole: 'member', capabilityMap: createCapabilityMap('view') };

		renderPage();

		expect(screen.getByText('Access restricted.')).toBeTruthy();
		expect(screen.queryByRole('group', { name: 'Bulk status sections' })).toBeNull();
		expect(screen.getByRole('link', { name: 'Calendar' })).toBeTruthy();
	});

	it('allows Calendar operators to use bulk status', () => {
		accessFacts = { membershipRole: 'member', capabilityMap: { ...createCapabilityMap('none'), calendar: 'operate' } };

		renderPage();

		expect(screen.getByRole('group', { name: 'Bulk status sections' })).toBeTruthy();
		expect(screen.queryByText('Access restricted.')).toBeNull();
	});

	it('loads Remove review ranges with the canonical organization id', async () => {
		pageMock.url = new URL('http://localhost/org/local-dev-test/calendar/bulk?tab=remove');
		orgUrlSegment = 'local-dev-test';

		renderPage('canonical-org-id');

		await fireEvent.click(screen.getByRole('button', { name: 'Load Remove Range' }));

		await waitFor(() => {
			expect(loadCalendarRangeMock).toHaveBeenCalledWith('canonical-org-id', {
				rangeStart: '2026-01-01',
				rangeEnd: '2026-01-31'
			});
		});
		expect(mergeCalendarRangeIntoStoresMock).toHaveBeenCalledWith(
			'canonical-org-id',
			expect.objectContaining({ rangeStart: '2026-01-01', rangeEnd: '2026-01-31' })
		);
	});

	it('does not merge Remove review ranges after the organization changes', async () => {
		let resolveRange: ((value: Awaited<ReturnType<typeof loadCalendarRangeMock>>) => void) | undefined;
		loadCalendarRangeMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveRange = resolve;
				})
		);
		pageMock.url = new URL('http://localhost/org/org-a/calendar/bulk?tab=remove');
		orgUrlSegment = 'org-a';

		const view = renderPage('org-a');

		await fireEvent.click(screen.getByRole('button', { name: 'Load Remove Range' }));

		await waitFor(() => {
			expect(loadCalendarRangeMock).toHaveBeenCalledWith('org-a', {
				rangeStart: '2026-01-01',
				rangeEnd: '2026-01-31'
			});
		});
		await view.rerender({ org, data: { orgId: 'org-b' } });
		resolveRange?.({
			rangeStart: '2026-01-01',
			rangeEnd: '2026-01-31',
			availabilityEntries: [],
			specialDays: [],
			dailyAssignments: []
		});

		await waitFor(() => {
			expect(screen.getByRole('status').textContent).toContain('Remove range load failed');
		});
		expect(mergeCalendarRangeIntoStoresMock).not.toHaveBeenCalled();
	});
	it.each(['unmounted', 'returned-to-A'])(
		'discards a held Remove range after its instance is %s',
		async (retirement) => {
			let release!: (value: unknown) => void;
			const pending = new Promise((resolve) => {
				release = resolve;
			});
			loadCalendarRangeMock.mockReturnValueOnce(pending);
			pageMock.url = new URL('http://localhost/org/org-a/calendar/bulk?tab=remove');
			const old = renderPage('org-a');
			await fireEvent.click(screen.getByRole('button', { name: 'Load Remove Range' }));
			old.unmount();
			if (retirement === 'returned-to-A') {
				const peer = renderPage('org-b');
				peer.unmount();
				renderPage('org-a');
				await fireEvent.click(screen.getByRole('button', { name: 'Load Remove Range' }));
				await waitFor(() => expect(mergeCalendarRangeIntoStoresMock).toHaveBeenCalledOnce());
			}
			await act(async () => {
				release({
					rangeStart: '2026-01-01',
					rangeEnd: '2026-01-31',
					availabilityEntries: [],
					specialDays: [],
					dailyAssignments: []
				});
				await pending;
			});
			expect(mergeCalendarRangeIntoStoresMock).toHaveBeenCalledTimes(retirement === 'returned-to-A' ? 1 : 0);
		}
	);
});
