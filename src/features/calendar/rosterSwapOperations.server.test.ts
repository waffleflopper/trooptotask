import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_RANK_CATALOG } from '$features/personnel/contracts';
import { createWriteWithNotificationsPortsContext } from './calendarPersistence.test-support.server';
import { saveRosterSettings } from './rosterSettingsOperations.server';
import { loadPlannerRosters } from './rosterPlannerOperations.server';
import { commitRosterSwap, previewRosterSwap, undoRosterSwap } from './rosterSwapOperations.server';
import { createSupabaseRosterSwapPersistence } from './rosterSwapPersistence.server';
import type { CalendarRosterSwapPersistence, RosterSwapResult } from './contracts';

const TYPE = '00000000-0000-4000-8000-000000000401';
const KIM = '00000000-0000-4000-8000-000000000301';
const PATEL = '00000000-0000-4000-8000-000000000302';
const MOSS = '00000000-0000-4000-8000-000000000303';
const SWAP = '00000000-0000-4000-8000-000000000501';
const LEAVE = '00000000-0000-4000-8000-000000000601';
const today = '2026-10-12';
const request = {
	today,
	days: [
		{ assignmentTypeId: TYPE, date: today, was: KIM },
		{ assignmentTypeId: TYPE, date: '2026-10-19', was: PATEL }
	]
};
const swap = {
	id: SWAP,
	days: [
		{ date: today, heldBy: KIM },
		{ date: '2026-10-19', heldBy: PATEL }
	]
} as const;
const result: RosterSwapResult = { saved: [], swap, assignmentTypeId: TYPE };

function context(options?: Parameters<typeof createWriteWithNotificationsPortsContext>[0]) {
	const ctx = createWriteWithNotificationsPortsContext(options);
	const calendarRosterSwaps: CalendarRosterSwapPersistence = { swap: async () => result, undo: async () => result };
	return {
		...ctx,
		calendarRosterSwaps,
		loadRankCatalog: async () =>
			BUILT_IN_RANK_CATALOG.map((rank) => ({ ...rank, organizationId: ctx.auth.orgId, source: 'built-in' as const }))
	};
}
function seed(ctx: ReturnType<typeof context>, swapped = false) {
	const org = ctx.auth.orgId;
	ctx.store.seed(
		'personnel',
		[
			[KIM, 'Kim'],
			[PATEL, 'Patel'],
			[MOSS, 'Moss']
		].map(([id, last_name]) => ({
			id,
			organization_id: org,
			group_id: null,
			rank: 'SPC',
			first_name: '',
			last_name,
			mos: '',
			clinic_role: '',
			archived: false,
			created_at: '2026-01-01T00:00:00Z'
		}))
	);
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
			starts_on: today,
			ends_on: null,
			rules: { pool: null, weekendMode: 'same' },
			record: null
		}
	]);
	ctx.store.seed(
		'roster_starting_numbers',
		[
			[KIM, 5],
			[PATEL, 3],
			[MOSS, 0]
		].map(([personnel_id, count]) => ({
			organization_id: org,
			form_id: 'form-open',
			personnel_id,
			track: 'all',
			count,
			origin: 'typed'
		}))
	);
	ctx.store.seed('daily_assignments', [
		{
			id: 'day-12',
			organization_id: org,
			assignment_type_id: TYPE,
			date: today,
			assignee_id: swapped ? PATEL : KIM,
			source: swapped ? 'manual' : 'roster'
		},
		{
			id: 'day-19',
			organization_id: org,
			assignment_type_id: TYPE,
			date: '2026-10-19',
			assignee_id: swapped ? KIM : PATEL,
			source: swapped ? 'manual' : 'roster'
		}
	]);
	ctx.store.seed(
		'roster_swaps',
		swapped
			? [
					{
						id: SWAP,
						organization_id: org,
						assignment_type_id: TYPE,
						first_date: today,
						first_held_by: KIM,
						second_date: '2026-10-19',
						second_held_by: PATEL
					}
				]
			: []
	);
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('duty swap operations', () => {
	it('denies Group-scoped operators on preview, commit and undo without writing', async () => {
		const ctx = context({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'operate',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['alpha'] }
			}
		});
		const write = vi.spyOn(ctx.calendarRosterSwaps, 'swap');
		const undo = vi.spyOn(ctx.calendarRosterSwaps, 'undo');
		for (const action of [
			() => previewRosterSwap(ctx, { typeId: TYPE, today, date: today }),
			() => commitRosterSwap(ctx, request),
			() => undoRosterSwap(ctx, { today, swapId: SWAP })
		]) {
			await expect(action()).rejects.toMatchObject({ status: 403 });
		}
		expect(write).not.toHaveBeenCalled();
		expect(undo).not.toHaveBeenCalled();
	});

	it.each([
		[{ ...request.days[1], assignmentTypeId: SWAP }, 'Both days need to be on the same duty.'],
		[{ ...request.days[1], date: today }, 'Choose two different days.'],
		[{ ...request.days[1], date: '2026-10-11' }, 'Swap only today or later days.'],
		[{ ...request.days[1], was: null }, 'Both days need an assigned person.'],
		[{ ...request.days[1], was: '' }, 'Both days need an assigned person.'],
		[{ ...request.days[1], was: KIM }, 'Choose days held by two different people.']
	])('explains an invalid exchange before writing', async (second, message) => {
		const ctx = context();
		const write = vi.spyOn(ctx.calendarRosterSwaps, 'swap');
		await expect(commitRosterSwap(ctx, { ...request, days: [request.days[0], second] })).rejects.toMatchObject({
			status: 400,
			message
		});
		expect(write).not.toHaveBeenCalled();
	});

	it('refuses past, empty and already swapped preview days', async () => {
		const ctx = context();
		seed(ctx);
		await expect(previewRosterSwap(ctx, { typeId: TYPE, today, date: '2026-10-11' })).rejects.toMatchObject({
			status: 400,
			message: 'Swap only today or later days.'
		});
		await expect(previewRosterSwap(ctx, { typeId: TYPE, today, date: '2026-10-13' })).rejects.toMatchObject({
			status: 400,
			message: 'Both days need an assigned person.'
		});
		seed(ctx, true);
		await expect(previewRosterSwap(ctx, { typeId: TYPE, today, date: today })).rejects.toMatchObject({
			status: 400,
			message: 'One of these days is already in a swap. Undo it first.'
		});
	});

	it('previews both placements with leave warnings, including a holder outside the pool', async () => {
		const ctx = context();
		seed(ctx);
		await ctx.store.update('roster_forms', ctx.auth.orgId, 'form-open', {
			rules: { pool: { rank: null, mos: ['68W'], role: [], groupIds: [] }, weekendMode: 'same' }
		});
		ctx.store.seed('status_types', [
			{
				id: LEAVE,
				organization_id: ctx.auth.orgId,
				name: 'Leave',
				color: '#fff',
				text_color: '#000',
				short_label: null,
				roster_effect: 'A',
				sort_order: 0,
				show_on_calendar: true
			}
		]);
		ctx.store.seed('availability_entries', [
			{
				id: 'leave-kim',
				organization_id: ctx.auth.orgId,
				personnel_id: KIM,
				status_type_id: LEAVE,
				start_date: '2026-10-19',
				end_date: '2026-10-19'
			},
			{
				id: 'leave-patel',
				organization_id: ctx.auth.orgId,
				personnel_id: PATEL,
				status_type_id: LEAVE,
				start_date: today,
				end_date: today
			}
		]);
		await expect(previewRosterSwap(ctx, { typeId: TYPE, today, date: today })).resolves.toEqual({
			date: today,
			personId: KIM,
			days: [
				{
					date: '2026-10-19',
					personId: PATEL,
					warnings: [
						{ personId: KIM, date: '2026-10-19', code: 'A', reason: 'Leave' },
						{ personId: PATEL, date: today, code: 'A', reason: 'Leave' }
					]
				}
			]
		});
	});

	it('returns literal Kim and Patel counts through the planner before, after and after undo', async () => {
		vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
		for (const swapped of [false, true, false]) {
			const ctx = context();
			seed(ctx, swapped);
			const [roster] = await loadPlannerRosters(ctx, { today: '2026-10-20', month: '2026-10' });
			expect(
				roster.current?.map(({ track, standing }) => ({
					track,
					people: Array.from({ length: standing.length / 3 }, (_, at) => [
						roster.people[standing[at * 3]],
						standing[at * 3 + 1]
					])
				}))
			).toEqual([
				{
					track: 'all',
					people: [
						[MOSS, 2],
						[KIM, 1],
						[PATEL, 0]
					]
				}
			]);
			expect(roster.swaps).toEqual(swapped ? [swap] : []);
		}
	});

	it('keeps the exchange remark and charges in the closed form record', async () => {
		vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
		const ctx = context();
		seed(ctx, true);
		await saveRosterSettings(ctx, {
			id: TYPE,
			today: '2026-10-20',
			poolRules: null,
			weekendMode: 'separate',
			excusals: []
		});
		const [closed] = await ctx.calendarCatalogs.listClosedRosterForms(TYPE, '2026-10');
		expect(closed.readable).toBe(true);
		if (!closed.readable) throw new Error('The closed form must be readable.');
		expect(closed.segment?.columns.map(({ pick, heldBy }) => [pick.personId, heldBy?.personId ?? null])).toEqual([
			[PATEL, KIM],
			[KIM, PATEL]
		]);
		expect(closed.segment?.remarks).toEqual([
			{
				kind: 'swapped',
				who: { personId: KIM, rank: 'SPC', firstName: '', lastName: 'Kim' },
				on: today,
				with: { personId: PATEL, rank: 'SPC', firstName: '', lastName: 'Patel' },
				other: '2026-10-19'
			}
		]);
		expect(closed.segment?.cells).toEqual([
			[
				{ kind: 'detail', count: 6, when: 'served' },
				{ kind: 'count', count: 1 }
			],
			[
				{ kind: 'count', count: 1 },
				{ kind: 'count', count: 2 }
			],
			[
				{ kind: 'count', count: 4 },
				{ kind: 'detail', count: 5, when: 'served' }
			]
		]);
	});

	it.each(['swap', 'undo'] as const)('waits for the %s audit before reporting success', async (kind) => {
		const ctx = context();
		let release = () => {};
		let logged = false;
		let completed = false;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		ctx.audit.log = async (event) => {
			expect(event).toEqual({
				action: kind === 'swap' ? 'daily_assignment.roster_swapped' : 'daily_assignment.roster_swap_undone',
				resourceType: 'daily_assignment',
				details: { assignmentTypeId: TYPE, dates: ['2026-10-12', '2026-10-19'] }
			});
			logged = true;
			await held;
		};
		const pending = (
			kind === 'swap' ? commitRosterSwap(ctx, request) : undoRosterSwap(ctx, { today, swapId: SWAP })
		).then((value) => {
			completed = true;
			return value;
		});
		await vi.waitFor(() => expect(logged).toBe(true));
		expect(completed).toBe(false);
		release();
		await expect(pending).resolves.toEqual(result);
	});

	it.each([
		['RSW01', 409, 'The roster changed since this preview. Review the days and try again.'],
		['RSW02', 400, 'Swap only today or later days.'],
		['RSW03', 400, 'Choose two different days.'],
		['RSW04', 400, 'Both days need an assigned person.'],
		['RSW05', 400, 'Choose days held by two different people.'],
		['RSW06', 400, 'Both days need a person-assigned duty.'],
		['RSW07', 400, 'One of these days is already in a swap. Undo it first.']
	])('maps database refusal %s through the server operation', async (code, status, message) => {
		const ctx = context();
		const client = {
			rpc: vi.fn().mockResolvedValue({ data: null, error: { code, message: 'database detail' } })
		} as unknown as SupabaseClient;
		ctx.calendarRosterSwaps = createSupabaseRosterSwapPersistence(client, ctx.auth.orgId);
		await expect(commitRosterSwap(ctx, request)).rejects.toMatchObject({ status, message });
		expect(ctx.audit.events).toEqual([]);
	});

	it('returns both saved assignments and the original holders through the user-client RPC', async () => {
		const ctx = context();
		const rows = [
			{ id: 'day-12', date: today, assignee_id: PATEL },
			{ id: 'day-19', date: '2026-10-19', assignee_id: KIM }
		].map((row) => ({
			...row,
			assignment_type_id: TYPE,
			organization_id: ctx.auth.orgId,
			created_at: '2026-10-01T00:00:00Z'
		}));
		const client = {
			rpc: vi.fn().mockResolvedValue({
				data: {
					swap: {
						id: SWAP,
						assignment_type_id: TYPE,
						first_date: today,
						first_held_by: KIM,
						second_date: '2026-10-19',
						second_held_by: PATEL
					},
					saved: rows
				},
				error: null
			})
		} as unknown as SupabaseClient;
		ctx.calendarRosterSwaps = createSupabaseRosterSwapPersistence(client, ctx.auth.orgId);
		await expect(commitRosterSwap(ctx, request)).resolves.toEqual({
			assignmentTypeId: TYPE,
			swap,
			saved: [
				{
					id: 'day-12',
					date: '2026-10-12',
					assigneeId: PATEL,
					assignmentTypeId: TYPE,
					organization_id: ctx.auth.orgId,
					created_at: '2026-10-01T00:00:00Z'
				},
				{
					id: 'day-19',
					date: '2026-10-19',
					assigneeId: KIM,
					assignmentTypeId: TYPE,
					organization_id: ctx.auth.orgId,
					created_at: '2026-10-01T00:00:00Z'
				}
			]
		});
		expect(ctx.audit.events).toEqual([
			{
				action: 'daily_assignment.roster_swapped',
				resourceType: 'daily_assignment',
				details: { assignmentTypeId: TYPE, dates: ['2026-10-12', '2026-10-19'] }
			}
		]);
	});

	it('explains why an elapsed swap cannot be undone', async () => {
		const ctx = context();
		const client = {
			rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'RSW02', message: 'past' } })
		} as unknown as SupabaseClient;
		ctx.calendarRosterSwaps = createSupabaseRosterSwapPersistence(client, ctx.auth.orgId);
		await expect(undoRosterSwap(ctx, { today, swapId: SWAP })).rejects.toMatchObject({
			status: 400,
			message: 'A swap cannot be undone after either day has passed.'
		});
	});
});
