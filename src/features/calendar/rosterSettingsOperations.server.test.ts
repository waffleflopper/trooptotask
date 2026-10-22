import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWriteWithNotificationsPortsContext } from './calendarPersistence.test-support.server';
import { saveRosterSettings } from './rosterSettingsOperations.server';

const TYPE = '00000000-0000-4000-a000-000000000001';
const PIKE = '00000000-0000-4000-a000-000000000011';
const KIM = '00000000-0000-4000-a000-000000000012';
const LEAVE = '00000000-0000-4000-a000-000000000021';
const TODAY = '2026-10-17';

type Context = ReturnType<typeof createWriteWithNotificationsPortsContext>;
type FormRow = { id: string; starts_on: string; ends_on: string | null; rules: unknown; record: unknown };
type NumberRow = { form_id: string; personnel_id: string; track: string; count: number; origin: string };

function seedRoster(ctx: Context, form: { startsOn: string; numbers: [string, number][] }) {
	const org = ctx.auth.orgId;
	const person = (id: string, rank: string, lastName: string) => ({
		id,
		organization_id: org,
		rank,
		last_name: lastName,
		first_name: 'A',
		mos: '68W',
		clinic_role: '',
		group_id: null,
		archived_at: null,
		created_at: '2026-09-01T00:00:00.000Z'
	});
	ctx.store.seed('personnel', [person(PIKE, 'SGT', 'Pike'), person(KIM, 'SPC', 'Kim')]);
	ctx.store.seed('assignment_types', [
		{
			id: TYPE,
			organization_id: org,
			name: 'Staff Duty',
			short_name: 'SD',
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
			id: 'form-open',
			organization_id: org,
			assignment_type_id: TYPE,
			starts_on: form.startsOn,
			ends_on: null,
			rules: { pool: null, weekendMode: 'same' },
			record: null
		}
	]);
	ctx.store.seed(
		'roster_starting_numbers',
		form.numbers.map(([personnelId, count]) => ({
			organization_id: org,
			form_id: 'form-open',
			personnel_id: personnelId,
			track: 'all',
			count,
			origin: 'typed'
		}))
	);
}

const settings = (overrides: Record<string, unknown> = {}) => ({
	id: TYPE,
	poolRules: null,
	weekendMode: 'same',
	excusals: [],
	today: TODAY,
	...overrides
});

const forms = async (ctx: Context) =>
	(await ctx.store.findMany<FormRow>('roster_forms', ctx.auth.orgId)).sort((a, b) =>
		a.starts_on.localeCompare(b.starts_on)
	);

const numbersOf = async (ctx: Context, formId: string) =>
	(await ctx.store.findMany<NumberRow>('roster_starting_numbers', ctx.auth.orgId, { form_id: formId }))
		.map(({ personnel_id, track, count }) => [personnel_id, track, count])
		.sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`));

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-17T15:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('saveRosterSettings', () => {
	it('closes the open form on today with its record and opens tomorrow carrying every count', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedRoster(ctx, {
			startsOn: '2026-10-15',
			numbers: [
				[PIKE, 3],
				[KIM, 5]
			]
		});
		ctx.store.seed('status_types', [
			{ id: LEAVE, organization_id: ctx.auth.orgId, name: 'Leave', color: '#ff0', text_color: '#000', sort_order: 0 }
		]);
		ctx.store.seed('daily_assignments', [
			{ id: 'sd-15', organization_id: ctx.auth.orgId, date: '2026-10-15', assignment_type_id: TYPE, assignee_id: PIKE },
			{ id: 'sd-16', organization_id: ctx.auth.orgId, date: '2026-10-16', assignment_type_id: TYPE, assignee_id: PIKE }
		]);
		ctx.store.seed('availability_entries', [
			{
				id: 'leave-16',
				organization_id: ctx.auth.orgId,
				personnel_id: KIM,
				status_type_id: LEAVE,
				start_date: '2026-10-16',
				end_date: '2026-10-16'
			}
		]);

		const saved = await saveRosterSettings(ctx, settings({ weekendMode: 'separate' }));

		expect(saved.weekendMode).toBe('separate');
		const [closed, next] = await forms(ctx);
		expect(closed).toMatchObject({ id: 'form-open', starts_on: '2026-10-15', ends_on: TODAY });
		expect(closed.record).toEqual({ segments: expect.arrayContaining([expect.anything()]) });
		expect(next).toMatchObject({
			starts_on: '2026-10-18',
			ends_on: null,
			rules: { pool: null, weekendMode: 'separate' }
		});
		// Counts move only on days the duty is pulled. Pike pulled both, so he ends at 0. Kim gained one on the
		// 15th and held it on leave the 16th. Same count carries into both Separate tracks.
		expect(await numbersOf(ctx, next.id)).toEqual([
			[PIKE, 'weekday', 0],
			[PIKE, 'weekend', 0],
			[KIM, 'weekday', 6],
			[KIM, 'weekend', 6]
		]);
	});

	it('takes new rules in place on a form that has not started yet', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedRoster(ctx, { startsOn: '2026-10-18', numbers: [[PIKE, 4]] });

		await saveRosterSettings(ctx, settings({ weekendMode: 'separate' }));

		const [form, ...others] = await forms(ctx);
		expect(others).toEqual([]);
		expect(form).toMatchObject({ id: 'form-open', starts_on: '2026-10-18', ends_on: null, record: null });
		expect(await numbersOf(ctx, form.id)).toEqual([
			[PIKE, 'weekday', 4],
			[PIKE, 'weekend', 4]
		]);
	});

	it('changes excusals without starting a new form', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedRoster(ctx, { startsOn: '2026-10-01', numbers: [] });

		const saved = await saveRosterSettings(
			ctx,
			settings({ excusals: [{ personId: KIM, reason: ' First sergeant ' }] })
		);

		expect(saved.excusals).toEqual([{ personId: KIM, reason: 'First sergeant', startsOn: TODAY }]);
		expect((await forms(ctx)).map(({ id, ends_on }) => [id, ends_on])).toEqual([['form-open', null]]);
	});

	it.each([
		['a blank excusal reason', settings({ excusals: [{ personId: KIM, reason: '  ' }] })],
		['a device date two days off', settings({ weekendMode: 'none', today: '2026-10-15' })]
	])('refuses %s and changes nothing', async (_, input) => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedRoster(ctx, { startsOn: '2026-10-01', numbers: [] });

		await expect(saveRosterSettings(ctx, input)).rejects.toMatchObject({ status: 400 });

		expect(await ctx.store.findMany('roster_excusals', ctx.auth.orgId)).toEqual([]);
		expect((await forms(ctx)).map(({ ends_on }) => ends_on)).toEqual([null]);
	});

	it('refuses a member who cannot configure assignment types', async () => {
		const ctx = createWriteWithNotificationsPortsContext({
			auth: {
				capabilityMap: {
					calendar: 'operate',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				}
			}
		});
		seedRoster(ctx, { startsOn: '2026-10-01', numbers: [] });

		await expect(saveRosterSettings(ctx, settings({ weekendMode: 'none' }))).rejects.toMatchObject({ status: 403 });

		expect((await forms(ctx)).map(({ ends_on }) => ends_on)).toEqual([null]);
	});
});
