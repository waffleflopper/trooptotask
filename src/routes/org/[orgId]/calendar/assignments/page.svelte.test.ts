// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';
import { createTestOrgContext } from '$lib/test-support/orgContextBuilder';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';

vi.mock('$lib/stores/orgContext.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/stores/orgContext.svelte')>()),
	getOrgContext: () => createTestOrgContext({ orgId: 'org-1', userId: 'user-1', userRole: 'owner' })
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
				showInDateHeader: false
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
