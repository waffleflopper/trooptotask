// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import BulkStatusPage from './BulkStatusPage.svelte';

const { gotoMock, orgContextMock } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	orgContextMock: {
		orgId: 'org-1',
		isPrivileged: true,
		isFullEditor: true,
		readOnly: false,
		affordanceForFeatureAction: vi.fn(() => ({ allowed: true, visible: true, disabled: false }))
	}
}));

vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	invalidate: vi.fn()
}));

vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/org/org-1/calendar/bulk?tab=add') }
}));

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => orgContextMock
}));

vi.mock('./BulkStatusAdd.svelte', async () => ({
	default: (await import('$lib/test-stubs/VisibleStub.svelte')).default
}));

vi.mock('./BulkStatusRemove.svelte', async () => ({
	default: (await import('$lib/test-stubs/VisibleStub.svelte')).default
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

vi.mock('$lib/stores/pinnedGroups.svelte', () => ({
	pinnedGroupsStore: { list: [] }
}));

vi.mock('$features/personnel/utils/personnelGrouping', () => ({
	groupAndSortPersonnel: vi.fn(() => [])
}));

vi.mock('$lib/utils/scopePersonnel', () => ({
	scopePersonnelByGroupScopeSet: vi.fn((value) => value)
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
		orgContextMock.isPrivileged = true;
		orgContextMock.isFullEditor = true;
		orgContextMock.readOnly = false;
		orgContextMock.affordanceForFeatureAction.mockReturnValue({ allowed: true, visible: true, disabled: false });
	});

	it('preserves the permission gate for read-only users', () => {
		orgContextMock.readOnly = true;
		orgContextMock.affordanceForFeatureAction.mockReturnValue({
			allowed: false,
			visible: true,
			disabled: true
		});

		renderPage();

		expect(screen.getByText('Access restricted.')).toBeTruthy();
		expect(screen.queryByRole('group', { name: 'Bulk status sections' })).toBeNull();
		expect(screen.getByRole('link', { name: 'Calendar' })).toBeTruthy();
	});

	it('allows Calendar operators to use bulk status without full-editor compatibility', () => {
		orgContextMock.isPrivileged = false;
		orgContextMock.isFullEditor = false;
		orgContextMock.affordanceForFeatureAction.mockReturnValue({ allowed: true, visible: true, disabled: false });

		renderPage();

		expect(screen.getByRole('group', { name: 'Bulk status sections' })).toBeTruthy();
		expect(screen.queryByText('Access restricted.')).toBeNull();
	});
});
