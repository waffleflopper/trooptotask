// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import Page from './+page.svelte';
import { createReadyAppShellRouteData } from '../../appShell.test-support';
import { createClientAccess } from '$lib/access/clientAccess';
import { calendarStore, dailyAssignmentsStore } from '$features/calendar';

vi.mock('$features/app-shell', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/app-shell')>()),
	getAppShellContext: () => ({ ...createClientAccess({ membershipRole: 'owner' }), orgUrlSegment: 'org-1' })
}));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it('loads the visible month for the shell Organization from a streamed, differently anchored bootstrap', async () => {
	calendarStore.goToMonth(2026, 8);
	dailyAssignmentsStore.load(
		[
			{
				id: 'type-1',
				name: 'Staff Duty',
				shortName: 'SD',
				assignTo: 'personnel',
				color: '#2563eb',
				exemptPersonnelIds: [],
				showOnCalendar: false,
				sortOrder: 0
			}
		],
		[],
		'org-1'
	);
	const fetchRange = vi.fn(async (url: string) => {
		if (!url.startsWith('/org/org-1/api/calendar-range?')) return new Response('', { status: 404 });
		return Response.json({
			rangeStart: '2026-09-01',
			rangeEnd: '2026-10-31',
			availabilityEntries: [],
			specialDays: [],
			dailyAssignments: [{ id: 'saved', date: '2026-09-22', assignmentTypeId: 'type-1', assigneeId: 'person-1' }]
		});
	});
	vi.stubGlobal('fetch', fetchRange);
	render(Page, {
		data: {
			...createReadyAppShellRouteData({ orgId: 'org-1', orgName: 'Test Unit' }),
			calendar: {
				data: Promise.resolve({
					data: {
						rangeStart: '2026-11-01',
						rangeEnd: '2027-01-31',
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
	expect(
		(await screen.findByRole('button', { name: 'Select Staff Duty assignee for 2026-09-22' })).textContent
	).toContain('Smith');
	expect(fetchRange).toHaveBeenCalledWith('/org/org-1/api/calendar-range?rangeStart=2026-09-01&rangeEnd=2026-10-31');
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
	expect(screen.getByText('Loading assignment planner...')).toBeTruthy();
	await waitFor(() => expect(screen.queryByText('Loading assignment planner...')).toBeNull());

	expect(view.container.textContent).toBe('');
});
