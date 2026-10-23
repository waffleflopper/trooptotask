import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWriteWithNotificationsPortsContext } from './calendarPersistence.test-support.server';
import { updateAssignmentType } from './assignmentTypeOperations.server';
import { loadRosters } from './rosterFacts.server';
import { loadDa6View } from './da6Operations.server';
import { loadDa6Setup, saveStartingNumbers } from './rosterStartingNumbersOperations.server';
import { saveRosterSettings } from './rosterSettingsOperations.server';
import { previewStatusEffect } from './statusEffectPreview.server';
import { simulateRoster } from './roster/rosterEngine';

const TYPE = '00000000-0000-4000-a000-000000000001';
const FORM = '00000000-0000-4000-a000-000000000002';
const ABLE = '00000000-0000-4000-a000-000000000011';
const BAKER = '00000000-0000-4000-a000-000000000012';
const TODAY = '2026-10-22';

function fixture() {
	const ctx = createWriteWithNotificationsPortsContext();
	const organization_id = ctx.auth.orgId;
	ctx.store.seed(
		'personnel',
		[ABLE, BAKER].map((id, index) => ({
			id,
			organization_id,
			rank: 'SPC',
			last_name: index ? 'Baker' : 'Able',
			first_name: 'A',
			mos: '68W',
			clinic_role: '',
			group_id: null,
			archived_at: null,
			created_at: '2026-01-01T00:00:00Z'
		}))
	);
	ctx.store.seed('assignment_types', [
		{
			id: TYPE,
			organization_id,
			name: 'CQ',
			short_name: 'CQ',
			assign_to: 'personnel',
			color: '#dc2626',
			sort_order: 0,
			show_on_calendar: true,
			roster_pool_rules: null,
			roster_weekend_mode: 'same',
			archived_at: null
		}
	]);
	ctx.store.seed('roster_forms', [
		{
			id: FORM,
			organization_id,
			assignment_type_id: TYPE,
			starts_on: TODAY,
			ends_on: null,
			rules: { pool: null, weekendMode: 'same' },
			record: null
		}
	]);
	ctx.store.seed('daily_assignments', [
		{ id: 'served', organization_id, assignment_type_id: TYPE, date: '2026-10-21', assignee_id: ABLE, source: 'manual' }
	]);
	return ctx;
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-22T15:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('an inaugural form with a backdated detail', () => {
	it('counts the 21 Oct duty and locks starting numbers on a roster created on 22 Oct', async () => {
		const ctx = fixture();
		const [facts] = await loadRosters(ctx, { today: TODAY, window: { from: TODAY, through: TODAY } });
		expect(
			Object.fromEntries(
				simulateRoster(facts)
					.current![0].counts.map(({ personId, count }) => [personId, count])
					.sort()
			)
		).toEqual({ [ABLE]: 0, [BAKER]: 1 });
		const setup = await loadDa6Setup(ctx, { typeId: TYPE, today: TODAY });
		expect(setup.form).toMatchObject({ from: '2026-10-21', state: 'locked' });
		await expect(
			saveStartingNumbers(ctx, {
				typeId: TYPE,
				formId: FORM,
				today: TODAY,
				numbers: [{ personId: BAKER, track: 'all', count: 9 }]
			})
		).rejects.toMatchObject({ status: 409 });
		const view = await loadDa6View(ctx, { typeId: TYPE, month: '2026-10', today: TODAY });
		expect(view.sheets[0].from).toBe('2026-10-21');
		expect(view.sheets[0].segment?.columns[0].date).toBe('2026-10-21');
	});

	it('applies typed numbers before the effective first day', async () => {
		const ctx = fixture();
		ctx.store.seed('roster_starting_numbers', [
			{ organization_id: ctx.auth.orgId, form_id: FORM, personnel_id: BAKER, track: 'all', count: 5, origin: 'typed' }
		]);
		const [facts] = await loadRosters(ctx, { today: TODAY, window: { from: TODAY, through: TODAY } });
		expect(
			simulateRoster(facts)
				.current?.[0].counts.map(({ personId, count }) => [personId, count])
				.sort()
		).toEqual([
			[ABLE, 0],
			[BAKER, 6]
		]);
	});

	it('previews a status effect on the backdated day', async () => {
		const ctx = fixture();
		const status = '00000000-0000-4000-a000-000000000021';
		ctx.store.seed('status_types', [
			{
				id: status,
				organization_id: ctx.auth.orgId,
				name: 'Leave',
				color: '#dc2626',
				text_color: '#ffffff',
				short_label: 'L',
				sort_order: 0,
				roster_effect: 'A'
			}
		]);
		ctx.store.seed('availability_entries', [
			{
				id: 'away',
				organization_id: ctx.auth.orgId,
				personnel_id: BAKER,
				status_type_id: status,
				start_date: '2026-10-21',
				end_date: '2026-10-21'
			}
		]);
		expect(await previewStatusEffect(ctx, { id: status, rosterEffect: 'available', today: TODAY })).toContainEqual(
			expect.objectContaining({ assignmentTypeId: TYPE, personId: BAKER, change: { kind: 'number', from: 0, to: 1 } })
		);
	});

	it('keeps a prior-month detail in the saved record when rules close the inaugural form', async () => {
		const ctx = fixture();
		vi.setSystemTime(new Date('2026-11-01T15:00:00Z'));
		await ctx.store.update('roster_forms', ctx.auth.orgId, FORM, { starts_on: '2026-11-01' });
		await ctx.store.update('daily_assignments', ctx.auth.orgId, 'served', { date: '2026-10-31' });
		await saveRosterSettings(ctx, {
			id: TYPE,
			poolRules: null,
			weekendMode: 'separate',
			excusals: [],
			today: '2026-11-01'
		});
		const view = await loadDa6View(ctx, { typeId: TYPE, month: '2026-10', today: '2026-11-01' });
		expect(view.sheets[0]).toMatchObject({ formId: FORM, from: '2026-10-31', to: '2026-10-31' });
		expect(view.sheets[0].segment?.columns.map(({ date }) => date)).toEqual(['2026-10-31']);
	});

	it('starts a Group type converted to personnel with no Group-era duty or lock', async () => {
		const ctx = fixture();
		const group = '00000000-0000-4000-a000-000000000031';
		await ctx.store.delete('roster_forms', ctx.auth.orgId, FORM);
		await ctx.store.update('assignment_types', ctx.auth.orgId, TYPE, { assign_to: 'group' });
		ctx.store.seed('groups', [{ id: group, organization_id: ctx.auth.orgId, name: 'Alpha' }]);
		await ctx.store.update('daily_assignments', ctx.auth.orgId, 'served', { assignee_id: group });
		await ctx.store.insert('daily_assignments', ctx.auth.orgId, {
			assignment_type_id: TYPE,
			date: TODAY,
			assignee_id: group
		});
		await updateAssignmentType(ctx, { id: TYPE, assignTo: 'personnel' });
		const [facts] = await loadRosters(ctx, { today: TODAY, window: { from: TODAY, through: TODAY } });
		expect(facts.form.startsOn).toBe(TODAY);
		expect(facts.assignments).toEqual([]);
		expect(simulateRoster(facts).current?.[0].counts.map(({ count }) => count)).toEqual([0, 0]);
		expect((await loadDa6Setup(ctx, { typeId: TYPE, today: TODAY })).form?.state).toBe('editable');
	});

	it('keeps the new boundary after a closed form, even when nobody carried a number', async () => {
		const ctx = fixture();
		await ctx.store.insert('roster_forms', ctx.auth.orgId, {
			id: 'closed',
			assignment_type_id: TYPE,
			starts_on: '2026-10-01',
			ends_on: '2026-10-21',
			rules: { pool: null, weekendMode: 'same' },
			record: { segments: [] }
		});
		const [facts] = await loadRosters(ctx, { today: TODAY, window: { from: TODAY, through: TODAY } });
		expect(facts.form.startsOn).toBe(TODAY);
		expect(
			simulateRoster(facts)
				.current?.[0].counts.map(({ personId, count }) => [personId, count])
				.sort()
		).toEqual([
			[ABLE, 0],
			[BAKER, 0]
		]);
	});
});
