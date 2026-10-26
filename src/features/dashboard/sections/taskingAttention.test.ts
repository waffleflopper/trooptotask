import { describe, expect, it, vi } from 'vitest';
import type { TaskingAttentionRow } from '$features/calendar';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { DashboardTaskingsState } from '../contracts';
import type { DashboardAccess } from './dashboardAccess';
import type { DashboardInputs } from './dashboardInputs';
import { composeDashboardSections, dashboardSection } from './dashboardSections';
import { DASHBOARD_SECTIONS } from './dashboardSectionRegistry';
import { taskingAttention, taskingAttentionLoad } from './taskingAttention';

const ALPHA = 'group-alpha';
const base: TaskingAttentionRow = {
	taskingId: 't-1',
	kind: 'short',
	title: 'Provide four medics',
	responsibility: { kind: 'group', groupId: ALPHA },
	eventTitle: 'Range week',
	suspenseOn: '2026-10-30',
	executionStartsOn: '2026-10-28',
	required: 4,
	picked: 2,
	equipmentNotReady: 1
};

function inputs(taskings: DashboardTaskingsState): DashboardInputs {
	return {
		today: '2026-10-26',
		forecastDays: [],
		groups: [{ id: ALPHA, name: 'Alpha' }],
		page: { orgId: 'org-1', orgName: 'Test Unit', taskings }
	} as unknown as DashboardInputs;
}

const ready = (...rows: TaskingAttentionRow[]) =>
	inputs({
		status: 'ready',
		attention: { rows, total: rows.length, onTrack: [] },
		forecast: { events: [], suspenses: [] }
	});

describe('taskingAttention', () => {
	it('names a Short Tasking by its picks and equipment and offers to pick the people it lacks', () => {
		const [item] = taskingAttention(ready(base));

		expect(item).toMatchObject({
			kind: 'taskingShort',
			id: 'tasking:t-1',
			title: 'Provide four medics',
			subtitle: expect.stringMatching(/Alpha.*Range week.*2 of 4.*1 equipment/),
			timing: 'starts in 2 days',
			href: '/org/org-1/calendar/taskings/t-1',
			urgency: { date: '2026-10-28' },
			action: {
				label: 'Pick 2',
				mode: 'expand',
				policy: POLICY_ACTION_CATALOG.calendar.manageTaskings
			}
		});
	});

	it('only links a Tasking that is short on equipment alone', () => {
		const [item] = taskingAttention(ready({ ...base, required: null, picked: 1 }));

		expect(item).toMatchObject({ kind: 'taskingShort', href: '/org/org-1/calendar/taskings/t-1', action: null });
	});

	it('says underway for a Short Tasking whose execution has begun', () => {
		const [item] = taskingAttention(ready({ ...base, executionStartsOn: '2026-10-24' }));

		expect(item?.timing).toBe('underway');
	});

	it('counts days late for an Overdue Tasking and offers to mark it done in place', () => {
		const [item] = taskingAttention(
			ready({ ...base, kind: 'overdue', suspenseOn: '2026-10-23', required: null, equipmentNotReady: 0 })
		);

		expect(item).toMatchObject({
			kind: 'taskingOverdue',
			subtitle: expect.stringMatching(/23 Oct.*Alpha.*Range week/),
			timing: '3 days late',
			urgency: { daysLate: 3 },
			action: { label: 'Mark done', mode: 'run', policy: POLICY_ACTION_CATALOG.calendar.manageTaskings }
		});
	});

	it('ranks a Blocked Tasking by its suspense and offers to unblock it in place', () => {
		const [item] = taskingAttention(ready({ ...base, kind: 'blocked', suspenseOn: '2026-10-29' }));

		expect(item).toMatchObject({
			kind: 'taskingBlocked',
			timing: 'due in 3 days',
			urgency: { date: '2026-10-29' },
			action: { label: 'Unblock', mode: 'run', policy: POLICY_ACTION_CATALOG.calendar.manageTaskings }
		});
	});

	it('names the conflicting Person and their commitment and offers a Swap through the picker', () => {
		const conflict = {
			personnelId: 'p-okafor',
			personLabel: 'SGT Okafor',
			statusLabel: 'Leave',
			startsOn: '2026-10-27',
			endsOn: '2026-10-30',
			overlapDays: 2,
			executionDays: 3
		};
		const [item] = taskingAttention(ready({ ...base, kind: 'conflict', conflict }));

		expect(item).toMatchObject({
			kind: 'taskingConflict',
			id: 'tasking:t-1:conflict:p-okafor',
			title: expect.stringMatching(/SGT Okafor.*leave/),
			subtitle: expect.stringContaining('Provide four medics'),
			urgency: { date: '2026-10-27' },
			action: { label: 'Swap', mode: 'expand', policy: POLICY_ACTION_CATALOG.calendar.manageTaskings }
		});
	});

	it('names the Organization for a Tasking no Group owns', () => {
		const [item] = taskingAttention(ready({ ...base, responsibility: { kind: 'organization' } }));

		expect(item?.subtitle).toContain('Test Unit');
	});

	it.each<DashboardTaskingsState>([{ status: 'off' }, { status: 'pending' }, { status: 'failed' }])(
		'adds no rows while the source is $status',
		(state) => {
			expect(taskingAttention(inputs(state))).toEqual([]);
		}
	);
});

describe('taskingAttentionLoad', () => {
	it.each(['pending', 'failed'] as const)('reports %s and retries through the page', (status) => {
		const updates = { retryTaskings: vi.fn() };
		const load = taskingAttentionLoad(inputs({ status }));

		expect(load).toMatchObject({ state: status });
		load?.retry(updates as never);
		expect(updates.retryTaskings).toHaveBeenCalledOnce();
	});

	it.each<DashboardTaskingsState>([
		{ status: 'off' },
		{ status: 'ready', attention: { rows: [], total: 0, onTrack: [] }, forecast: { events: [], suspenses: [] } }
	])('reports nothing once the source is $status', (state) => {
		expect(taskingAttentionLoad(inputs(state))).toBeNull();
	});

	it('counts the rows the bound left out so the header still counts them', () => {
		const load = taskingAttentionLoad(
			inputs({
				status: 'ready',
				attention: { rows: [base], total: 4, onTrack: [] },
				forecast: { events: [], suspenses: [] }
			})
		);

		expect(load).toMatchObject({ state: 'partial', unlisted: 3, href: '/org/org-1/calendar/taskings' });
	});
});

describe('the Events & Taskings section', () => {
	const access = (viewEvents: boolean): DashboardAccess => ({
		can: (action) => action !== POLICY_ACTION_CATALOG.calendar.viewEvents || viewEvents,
		isPrivileged: false
	});
	const only = DASHBOARD_SECTIONS.filter((section) => section.id === 'eventsAndTaskings');

	it('queues the rows of a viewer who can see Events', () => {
		const parts = composeDashboardSections(only, ready(base), [], access(true));

		expect(parts.needsYou.ranked.map((item) => item.id)).toEqual(['tasking:t-1']);
		expect(parts.needsYouLoads).toEqual([]);
	});

	it('carries a failure beside the rows of the other sources', () => {
		const withOther = [
			dashboardSection('training', {
				needsYou: [
					() => [
						{
							kind: 'expired',
							id: 'expired:sharp',
							trainingTypeId: 'sharp',
							personnelIds: [],
							title: 'SHARP',
							subtitle: '',
							timing: '',
							href: '/org/org-1/training',
							action: null,
							urgency: { daysLate: 4 }
						}
					]
				]
			}),
			...only
		];

		const parts = composeDashboardSections(withOther, inputs({ status: 'failed' }), [], access(true));

		expect(parts.needsYou.ranked.map((item) => item.id)).toEqual(['expired:sharp']);
		expect(parts.needsYouLoads).toMatchObject([{ label: 'Tasking', state: 'failed' }]);
	});

	it('adds nothing when the switch is off', () => {
		const parts = composeDashboardSections(only, ready(base), ['eventsAndTaskings'], access(true));

		expect(parts.needsYou.ranked).toEqual([]);
		expect(parts.needsYouLoads).toEqual([]);
	});

	it('adds nothing for a viewer who cannot see Events', () => {
		const parts = composeDashboardSections(only, inputs({ status: 'pending' }), [], access(false));

		expect(parts.needsYou.ranked).toEqual([]);
		expect(parts.needsYouLoads).toEqual([]);
	});
});
