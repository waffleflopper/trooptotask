// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import BulkStatusPage from './BulkStatusPage.svelte';

const { gotoMock, loadCalendarRangeMock, mergeCalendarRangeIntoStoresMock, orgContextMock, pageMock } = vi.hoisted(
	() => ({
		gotoMock: vi.fn(),
		loadCalendarRangeMock: vi.fn(),
		mergeCalendarRangeIntoStoresMock: vi.fn(),
		orgContextMock: {
			orgId: 'org-1',
			orgUrlSegment: 'org-1',
			isPrivileged: true,
			affordanceForFeatureAction: vi.fn(() => ({ allowed: true, visible: true, disabled: false }))
		},
		pageMock: {
			url: new URL('http://localhost/org/org-1/calendar/bulk?tab=add')
		}
	})
);

vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	invalidate: vi.fn()
}));

vi.mock('$app/state', () => ({
	page: pageMock
}));

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => orgContextMock
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

vi.mock('$lib/stores/pinnedGroups.svelte', () => ({
	pinnedGroupsStore: { list: [] }
}));

function renderPage() {
	return render(BulkStatusPage, {
		props: {
			data: {
				orgId: 'org-1',
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
		orgContextMock.orgId = 'org-1';
		orgContextMock.orgUrlSegment = 'org-1';
		orgContextMock.isPrivileged = true;
		orgContextMock.affordanceForFeatureAction.mockReturnValue({ allowed: true, visible: true, disabled: false });
	});

	it('preserves the permission gate when availability operation is denied', () => {
		orgContextMock.affordanceForFeatureAction.mockReturnValue({
			allowed: false,
			visible: false,
			disabled: false
		});

		renderPage();

		expect(screen.getByText('Access restricted.')).toBeTruthy();
		expect(screen.queryByRole('group', { name: 'Bulk status sections' })).toBeNull();
		expect(screen.getByRole('link', { name: 'Calendar' })).toBeTruthy();
	});

	it('allows Calendar operators to use bulk status', () => {
		orgContextMock.isPrivileged = false;
		orgContextMock.affordanceForFeatureAction.mockReturnValue({ allowed: true, visible: true, disabled: false });

		renderPage();

		expect(screen.getByRole('group', { name: 'Bulk status sections' })).toBeTruthy();
		expect(screen.queryByText('Access restricted.')).toBeNull();
	});

	it('loads Remove review ranges with the canonical organization id', async () => {
		pageMock.url = new URL('http://localhost/org/local-dev-test/calendar/bulk?tab=remove');
		orgContextMock.orgId = 'canonical-org-id';
		orgContextMock.orgUrlSegment = 'local-dev-test';

		renderPage();

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
		orgContextMock.orgId = 'org-a';
		orgContextMock.orgUrlSegment = 'org-a';

		renderPage();

		await fireEvent.click(screen.getByRole('button', { name: 'Load Remove Range' }));

		await waitFor(() => {
			expect(loadCalendarRangeMock).toHaveBeenCalledWith('org-a', {
				rangeStart: '2026-01-01',
				rangeEnd: '2026-01-31'
			});
		});
		orgContextMock.orgId = 'org-b';
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
});
