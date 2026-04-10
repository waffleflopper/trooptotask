// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import VisibleStub from '$lib/test-stubs/VisibleStub.svelte';
import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
import type { CalendarBootstrap, CalendarRangeData } from '$lib/server/core/useCases/calendarQuery';

const { loadCalendarRangeMock, mergeCalendarRangeIntoStoresMock } = vi.hoisted(() => ({
	loadCalendarRangeMock: vi.fn(),
	mergeCalendarRangeIntoStoresMock: vi.fn()
}));

vi.mock('$features/calendar/components/CalendarPageView.svelte', () => ({
	default: VisibleStub
}));

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		isFullEditor: true,
		scopedGroupId: null,
		readOnly: false,
		permissions: {
			canViewCalendar: true,
			canEditCalendar: true,
			canViewPersonnel: true,
			canEditPersonnel: true,
			canViewTraining: true,
			canEditTraining: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canViewLeadersBook: true,
			canEditLeadersBook: true,
			canManageMembers: true
		}
	})
}));

vi.mock('$features/calendar/utils/calendarRangeLoader', () => ({
	loadCalendarRange: loadCalendarRangeMock,
	mergeCalendarRangeIntoStores: mergeCalendarRangeIntoStoresMock
}));

import Page from './+page.svelte';

function makeBootstrap(): WorkspaceBootstrap<CalendarBootstrap> {
	return {
		workspace: 'calendar',
		data: {
			rangeStart: '2026-03-01',
			rangeEnd: '2026-05-31',
			availabilityEntries: [],
			specialDays: [],
			assignmentTypes: [],
			dailyAssignments: [],
			pinnedGroups: [],
			advancedDutyEvents: [],
			personnel: [],
			groups: [],
			statusTypes: [],
			activeOnboardingPersonnelIds: []
		}
	};
}

describe('calendar page', () => {
	beforeEach(() => {
		loadCalendarRangeMock.mockReset();
		loadCalendarRangeMock.mockResolvedValue({
			rangeStart: '2026-06-01',
			rangeEnd: '2026-08-31',
			availabilityEntries: [],
			specialDays: [],
			dailyAssignments: [],
			advancedDutyEvents: []
		});
		mergeCalendarRangeIntoStoresMock.mockReset();
		calendarStore.goToMonth(2026, 3);
	});

	afterEach(() => {
		cleanup();
		calendarStore.goToMonth(2026, 3);
	});

	it('loads a larger calendar range on demand when navigating beyond the buffered window', async () => {
		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
					userId: 'user-1',
					permissions: {
						canViewCalendar: true,
						canEditCalendar: true
					},
					calendar: {
						data: makeBootstrap()
					}
				}
			}
		});

		expect(loadCalendarRangeMock).not.toHaveBeenCalled();

		calendarStore.goToMonth(2026, 7);

		await waitFor(() => {
			expect(loadCalendarRangeMock).toHaveBeenCalledWith('org-1', {
				rangeStart: '2026-06-01',
				rangeEnd: '2026-08-31'
			});
		});
	});

	it('keeps the current calendar visible while loading additional dates', async () => {
		let resolveRange: ((value: CalendarRangeData) => void) | undefined;
		loadCalendarRangeMock.mockReset();
		loadCalendarRangeMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveRange = resolve;
				})
		);

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
					userId: 'user-1',
					permissions: {
						canViewCalendar: true,
						canEditCalendar: true
					},
					calendar: {
						data: makeBootstrap()
					}
				}
			}
		});

		calendarStore.goToMonth(2026, 7);

		await waitFor(() => {
			expect(loadCalendarRangeMock).toHaveBeenCalledTimes(1);
		});

		expect(screen.getByTestId('visible-stub')).toBeTruthy();
		expect(screen.getByText('Loading additional calendar dates...')).toBeTruthy();

		resolveRange?.({
			rangeStart: '2026-06-01',
			rangeEnd: '2026-08-31',
			availabilityEntries: [],
			specialDays: [],
			dailyAssignments: [],
			advancedDutyEvents: []
		});
	});

	it('keeps the calendar visible when range loading fails and retries only on demand', async () => {
		loadCalendarRangeMock.mockReset();
		loadCalendarRangeMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({
			rangeStart: '2026-06-01',
			rangeEnd: '2026-08-31',
			availabilityEntries: [],
			specialDays: [],
			dailyAssignments: [],
			advancedDutyEvents: []
		});

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit',
					userId: 'user-1',
					permissions: {
						canViewCalendar: true,
						canEditCalendar: true
					},
					calendar: {
						data: makeBootstrap()
					}
				}
			}
		});

		calendarStore.goToMonth(2026, 7);

		await waitFor(() => {
			expect(loadCalendarRangeMock).toHaveBeenCalledTimes(1);
		});

		expect(screen.getByTestId('visible-stub')).toBeTruthy();
		await waitFor(() => {
			expect(screen.getByText('Additional calendar data is temporarily unavailable.')).toBeTruthy();
		});
		expect(screen.getByRole('button', { name: 'Retry calendar load' })).toBeTruthy();

		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(loadCalendarRangeMock).toHaveBeenCalledTimes(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Retry calendar load' }));

		await waitFor(() => {
			expect(loadCalendarRangeMock).toHaveBeenCalledTimes(2);
		});
	});
});
