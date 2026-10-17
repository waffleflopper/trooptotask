// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import Page from './+page.svelte';
import { createReadyAppShellRouteData } from '../../appShell.test-support';
import { createClientAccess } from '$lib/access/clientAccess';
import {
	calendarAssignmentsHydration,
	calendarAvailabilityHydration,
	calendarStatusHydration
} from '$features/calendar';

vi.mock('$features/app-shell', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/app-shell')>()),
	getAppShellContext: () => ({ ...createClientAccess({ membershipRole: 'owner' }), orgUrlSegment: 'friendly-unit' })
}));

vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/org/friendly-unit/calendar/bulk?tab=remove') }
}));

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn(), invalidateAll: vi.fn() }));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	calendarStatusHydration.load([], '');
	calendarAvailabilityHydration.load([], '');
	calendarAssignmentsHydration.load([], [], '');
});

it('reviews a whole saved overlap through the shell Organization when the route uses an alias', async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(2026, 0, 15, 12));
	const orgId = 'd9b34493-79a0-4284-985d-b54903409955';
	calendarStatusHydration.load(
		[{ id: 'training', name: 'Training', color: '#2563eb', textColor: '#ffffff', shortLabel: null, sortOrder: 0 }],
		orgId
	);
	calendarAvailabilityHydration.load([], orgId);
	calendarAssignmentsHydration.load([], [], orgId);
	const fetchRange = vi.fn(async (url: string) => {
		if (url !== `/org/${orgId}/api/calendar-range?rangeStart=2026-01-15&rangeEnd=2026-01-15`) {
			return new Response('', { status: 404 });
		}
		return Response.json({
			rangeStart: '2026-01-15',
			rangeEnd: '2026-01-15',
			availabilityEntries: [
				{
					id: 'saved-training',
					personnelId: 'person-1',
					statusTypeId: 'training',
					startDate: '2026-01-14',
					endDate: '2026-01-16',
					note: 'Known overlap'
				}
			],
			specialDays: [],
			dailyAssignments: []
		});
	});
	vi.stubGlobal('fetch', fetchRange);
	render(Page, {
		data: {
			...createReadyAppShellRouteData({ orgId, orgUrlSegment: 'friendly-unit', orgName: 'Test Unit' }),
			calendar: {
				data: Promise.resolve({
					data: {
						personnel: [
							{
								id: 'person-1',
								firstName: 'Alex',
								lastName: 'Smith',
								rank: 'SGT',
								groupId: 'group-1',
								groupName: 'Alpha',
								clinicRole: '',
								mos: '11B'
							}
						]
					}
				})
			}
		}
	});

	await fireEvent.click(await screen.findByRole('checkbox', { name: 'Select SGT Smith, Alex' }));
	await fireEvent.click(screen.getByRole('button', { name: 'Review Matching Entries' }));

	expect(fetchRange).toHaveBeenCalledWith(
		'/org/d9b34493-79a0-4284-985d-b54903409955/api/calendar-range?rangeStart=2026-01-15&rangeEnd=2026-01-15'
	);
	expect(await screen.findByRole('heading', { name: /partial overlap.*removed entirely/i })).toBeTruthy();
	expect(screen.getByText('SGT Smith, Alex')).toBeTruthy();
	expect(screen.getByText(/Jan 14, 2026.*Jan 16, 2026/)).toBeTruthy();
	expect(screen.getByRole('button', { name: 'Confirm Removal' })).toBeTruthy();
});

it('settles on nothing when the streamed workspace rejects, leaving the load error to the Calendar layout', async () => {
	const rejected = Promise.reject(new Error('availability failed'));
	rejected.catch(() => {});

	const view = render(Page, {
		data: {
			...createReadyAppShellRouteData({ orgId: 'org-1', orgName: 'Test Unit' }),
			calendar: { data: rejected }
		}
	});
	expect(screen.getByText('Loading bulk status operations...')).toBeTruthy();
	await waitFor(() => expect(screen.queryByText('Loading bulk status operations...')).toBeNull());

	expect(view.container.textContent).toBe('');
});
