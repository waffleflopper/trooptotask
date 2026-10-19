import { describe, expect, it } from 'vitest';
import { createQueryPortsContext } from './calendarPersistence.test-support.server';
import { loadPersonnelCalendarWindow } from '$features/calendar/index.server';

const ORG = 'test-org';
const RANGE = { rangeStart: '2026-10-06', rangeEnd: '2026-10-19' };
const PERSON = { id: 'p1', groupId: 'g1' };

function seededCtx(options?: Parameters<typeof createQueryPortsContext>[0]) {
	const ctx = createQueryPortsContext({ ...options, auth: { orgId: ORG, ...options?.auth } });
	ctx.store.seed('status_types', [
		{ id: 'leave', organization_id: ORG, name: 'Leave', color: '#ff0', text_color: '#000', sort_order: 0 },
		{ id: 'tdy', organization_id: ORG, name: 'TDY', color: '#00f', text_color: '#fff', sort_order: 1 }
	]);
	ctx.store.seed('availability_entries', [
		{
			id: 'mine',
			organization_id: ORG,
			personnel_id: 'p1',
			status_type_id: 'leave',
			start_date: '2026-10-16',
			end_date: '2026-10-19',
			note: null
		},
		{
			id: 'theirs',
			organization_id: ORG,
			personnel_id: 'p2',
			status_type_id: 'tdy',
			start_date: '2026-10-07',
			end_date: '2026-10-08',
			note: null
		}
	]);
	ctx.store.seed('assignment_types', [
		{
			id: 'cq',
			organization_id: ORG,
			name: 'CQ',
			short_name: 'CQ',
			assign_to: 'personnel',
			color: '#000',
			sort_order: 0
		},
		{
			id: 'det',
			organization_id: ORG,
			name: 'Detail',
			short_name: 'DET',
			assign_to: 'group',
			color: '#111',
			sort_order: 1
		},
		{
			id: 'sd',
			organization_id: ORG,
			name: 'Staff duty',
			short_name: 'SD',
			assign_to: 'personnel',
			color: '#222',
			sort_order: 2
		}
	]);
	ctx.store.seed('daily_assignments', [
		{ id: 'own', organization_id: ORG, date: '2026-10-08', assignment_type_id: 'cq', assignee_id: 'p1' },
		{ id: 'group', organization_id: ORG, date: '2026-10-12', assignment_type_id: 'det', assignee_id: 'g1' },
		{ id: 'other', organization_id: ORG, date: '2026-10-09', assignment_type_id: 'sd', assignee_id: 'p2' },
		{ id: 'later', organization_id: ORG, date: '2026-10-20', assignment_type_id: 'cq', assignee_id: 'p1' }
	]);
	ctx.store.seed('special_days', [
		{ id: 'donsa', organization_id: ORG, date: '2026-10-09', name: 'Training holiday', type: 'org-closure' }
	]);
	return ctx;
}

describe('loadPersonnelCalendarWindow', () => {
	it("reads the Person's own and Group entries in range with only the catalog rows they use", async () => {
		const window = await loadPersonnelCalendarWindow(seededCtx(), PERSON, RANGE);

		expect(window.availability.map((entry) => entry.id)).toEqual(['mine']);
		expect(window.statusTypes.map((status) => status.id)).toEqual(['leave']);
		expect(window.assignments.map((assignment) => assignment.id).sort()).toEqual(['group', 'own']);
		expect(window.assignmentTypes.map((type) => type.id).sort()).toEqual(['cq', 'det']);
		expect(window.specialDays.map((day) => day.id)).toEqual(['donsa']);
	});

	it('requires Calendar view access to the Person', async () => {
		const ctx = seededCtx({
			auth: {
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				}
			}
		});

		await expect(loadPersonnelCalendarWindow(ctx, PERSON, RANGE)).rejects.toMatchObject({ status: 403 });
	});
});
