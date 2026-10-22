import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWriteWithNotificationsPortsContext } from './calendarPersistence.test-support.server';
import { loadRosterFacts } from './rosterSettingsOperations.server';
import { previewStatusEffect } from './statusEffectPreview.server';
import { simulateRoster } from './roster/rosterEngine';

const SD = '00000000-0000-4000-a000-000000000001';
const CQ = '00000000-0000-4000-a000-000000000002';
const PIKE = '00000000-0000-4000-a000-000000000011';
const KIM = '00000000-0000-4000-a000-000000000012';
const LEAVE = '00000000-0000-4000-a000-000000000021';
const PASS = '00000000-0000-4000-a000-000000000022';
const TODAY = '2026-10-17';

type Context = ReturnType<typeof createWriteWithNotificationsPortsContext>;

function seed(ctx: Context, options: { rosterEffect?: string; assignments: [string, string][] }) {
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
			id: SD,
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
			id: 'sd-open',
			organization_id: org,
			assignment_type_id: SD,
			starts_on: '2026-10-15',
			ends_on: null,
			rules: { pool: null, weekendMode: 'same' },
			record: null
		}
	]);
	ctx.store.seed(
		'roster_starting_numbers',
		[PIKE, KIM].map((personnelId) => ({
			organization_id: org,
			form_id: 'sd-open',
			personnel_id: personnelId,
			track: 'all',
			count: 3,
			origin: 'typed'
		}))
	);
	ctx.store.seed('status_types', [
		{
			id: LEAVE,
			organization_id: org,
			name: 'Leave',
			color: '#ff0',
			text_color: '#000',
			roster_effect: options.rosterEffect ?? 'A',
			sort_order: 0
		}
	]);
	ctx.store.seed('availability_entries', [
		{
			id: 'leave-16',
			organization_id: org,
			personnel_id: KIM,
			status_type_id: LEAVE,
			start_date: '2026-10-16',
			end_date: '2026-10-16'
		}
	]);
	ctx.store.seed(
		'daily_assignments',
		options.assignments.map(([date, assignee]) => ({
			id: `sd-${date}`,
			organization_id: org,
			date,
			assignment_type_id: SD,
			assignee_id: assignee
		}))
	);
}

const PIKE_ALL_THREE: [string, string][] = [
	['2026-10-15', PIKE],
	['2026-10-16', PIKE],
	['2026-10-17', PIKE]
];

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-17T15:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('previewStatusEffect', () => {
	it('lists the number that moves today when an away status stops holding the count', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx, { assignments: PIKE_ALL_THREE });

		// Both start at 3 and reach 4 on the 15th, when Pike is picked and resets. Away on the 16th, Kim holds at 4
		// and reaches 5 on the 17th. Still available, Kim reaches 5 on the 16th and 6 on the 17th.
		expect(await previewStatusEffect(ctx, { id: LEAVE, rosterEffect: 'available', today: TODAY })).toEqual([
			{
				assignmentTypeId: SD,
				rosterName: 'Staff Duty',
				track: 'all',
				personId: KIM,
				person: 'SPC Kim',
				change: { kind: 'number', from: 5, to: 6 }
			}
		]);
	});

	it('counts the earlier days that change when today comes out the same', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx, {
			assignments: [
				['2026-10-15', PIKE],
				['2026-10-16', PIKE],
				['2026-10-17', KIM]
			]
		});

		expect(await previewStatusEffect(ctx, { id: LEAVE, rosterEffect: 'available', today: TODAY })).toEqual([
			{
				assignmentTypeId: SD,
				rosterName: 'Staff Duty',
				track: 'all',
				personId: KIM,
				person: 'SPC Kim',
				change: { kind: 'earlier', days: 1 }
			}
		]);
	});

	it('finds nothing when the effect is unchanged or no one holds the status, and saves nothing', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx, { assignments: PIKE_ALL_THREE });
		ctx.store.seed('status_types', [
			{ id: PASS, organization_id: ctx.auth.orgId, name: 'Pass', color: '#000', text_color: '#fff', sort_order: 1 }
		]);

		expect(await previewStatusEffect(ctx, { id: LEAVE, rosterEffect: 'A', today: TODAY })).toEqual([]);
		expect(await previewStatusEffect(ctx, { id: PASS, rosterEffect: 'D', today: TODAY })).toEqual([]);
		await expect(
			previewStatusEffect(ctx, { id: '00000000-0000-4000-a000-000000000099', rosterEffect: 'D', today: TODAY })
		).rejects.toMatchObject({ status: 404 });
		const saved = await ctx.store.findOne<{ roster_effect: string }>('status_types', ctx.auth.orgId, { id: LEAVE });
		expect(saved?.roster_effect).toBe('A');
	});

	it('reads only person-assigned rosters with an open form that has started', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx, { assignments: PIKE_ALL_THREE });
		const base = {
			organization_id: ctx.auth.orgId,
			short_name: 'X',
			color: '#111',
			sort_order: 1,
			show_on_calendar: false
		};
		ctx.store.seed('assignment_types', [
			{
				...base,
				id: CQ,
				name: 'CQ',
				assign_to: 'personnel',
				roster_pool_rules: null,
				roster_weekend_mode: 'same',
				archived_at: null
			},
			{
				...base,
				id: '00000000-0000-4000-a000-000000000003',
				name: 'Motor Pool',
				assign_to: 'group',
				roster_pool_rules: null,
				roster_weekend_mode: 'same',
				archived_at: null
			},
			{
				...base,
				id: '00000000-0000-4000-a000-000000000004',
				name: 'Old',
				assign_to: 'personnel',
				roster_pool_rules: null,
				roster_weekend_mode: 'same',
				archived_at: '2026-09-01T00:00:00Z'
			}
		]);
		ctx.store.seed('roster_forms', [
			{
				id: 'cq-open',
				organization_id: ctx.auth.orgId,
				assignment_type_id: CQ,
				starts_on: '2026-10-18',
				ends_on: null,
				rules: { pool: null, weekendMode: 'same' },
				record: null
			}
		]);

		const lines = await previewStatusEffect(ctx, { id: LEAVE, rosterEffect: 'available', today: TODAY });

		expect(lines.map(({ rosterName }) => rosterName)).toEqual(['Staff Duty']);
	});

	it('refuses a member who cannot configure status types and a device date two days off', async () => {
		const denied = createWriteWithNotificationsPortsContext({
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
		seed(denied, { assignments: PIKE_ALL_THREE });
		await expect(
			previewStatusEffect(denied, { id: LEAVE, rosterEffect: 'available', today: TODAY })
		).rejects.toMatchObject({ status: 403 });

		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx, { assignments: PIKE_ALL_THREE });
		await expect(
			previewStatusEffect(ctx, { id: LEAVE, rosterEffect: 'available', today: '2026-10-15' })
		).rejects.toMatchObject({ status: 400 });
		await expect(previewStatusEffect(ctx, { id: LEAVE, rosterEffect: 'maybe', today: TODAY })).rejects.toMatchObject({
			status: 400
		});
	});
});

describe('the roster facts read the stored effect', () => {
	const pickOn16 = async (rosterEffect: string) => {
		const ctx = createWriteWithNotificationsPortsContext();
		seed(ctx, {
			rosterEffect,
			assignments: [
				['2026-10-15', PIKE],
				['2026-10-17', PIKE]
			]
		});
		const form = (await ctx.calendarCatalogs.findOpenRosterForm(SD))!;
		const run = simulateRoster(await loadRosterFacts(ctx, { id: SD, name: 'Staff Duty' }, form, TODAY), {
			kind: 'fill',
			days: { from: '2026-10-16', through: '2026-10-16' }
		});
		return run.byDate.get('2026-10-16')?.rulePick;
	};

	it('lets a status set to Still available take the pick the away status would block', async () => {
		// On the 16th Pike is at 1 after his pick on the 15th. Kim is at 5 if she is available and held at 4 if away.
		expect(await pickOn16('A')).toBe(PIKE);
		expect(await pickOn16('available')).toBe(KIM);
	});
});
