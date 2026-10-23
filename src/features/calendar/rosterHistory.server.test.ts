import { describe, expect, it } from 'vitest';
import { boundAttributeTimelines } from '$features/personnel/index.server';
import type { PersonnelAttributeTimeline } from '$features/personnel/contracts';
import { rosterFacts } from './roster/rosterFixtures.test-support';
import { simulateRoster, closeForm, da6Segment, type RosterFacts } from './roster/rosterEngine';
import { createWriteWithNotificationsPortsContext } from './calendarPersistence.test-support.server';
import { loadRosters } from './rosterFacts.server';

const span = { from: '2026-10-15', through: '2026-10-31' };

function workload(): PersonnelAttributeTimeline[] {
	return Array.from({ length: 500 }, (_, index) => {
		const states = Array.from({ length: 36 }, (_, month) => ({
			from: `${2023 + Math.floor((month + 10) / 12)}-${String(((month + 10) % 12) + 1).padStart(2, '0')}-01`,
			archived: index >= 400 && month >= 24,
			rank: month >= 30 ? 'SPC' : 'PFC',
			mos: month % 2 ? '68W' : '68V',
			clinicRole: '',
			groupId: null
		}));
		const [first, ...rest] = states;
		return {
			id: `person-${index}`,
			rank: 'SPC',
			lastName: `Person${index}`,
			firstName: 'A',
			states: [first, ...rest, { ...states[35], from: '2026-10-20', clinicRole: 'Medic' }]
		};
	});
}

const enginePeople = (people: PersonnelAttributeTimeline[]): RosterFacts['people'] =>
	people.map(({ states: [first, ...rest], ...person }) => {
		const state = ({ archived, ...value }: PersonnelAttributeTimeline['states'][number]) => ({
			...value,
			active: !archived
		});
		return { ...person, states: [state(first), ...rest.map(state)] };
	});

it('preserves counts, picks, pool changes, closed records and DA 6 with three years of bounded history', () => {
	const full = workload();
	const bounded = boundAttributeTimelines(full, span, new Set(['person-499', 'person-498', 'person-497']));
	const facts = rosterFacts({
		today: span.through,
		window: span,
		form: {
			startsOn: span.from,
			startingNumbers: [{ personId: 'person-497', track: 'all', count: 4, origin: 'carried' }]
		},
		people: enginePeople(full),
		excusals: [
			{ personId: 'person-1', reason: 'Prior form', from: '2023-11-01', through: '2026-10-14' },
			{ personId: 'person-2', reason: 'Current', from: '2026-10-12', through: '2026-10-18' },
			{ personId: 'person-3', reason: 'Open', from: '2026-10-20', through: null },
			{ personId: 'person-498', reason: 'Archived but still remarked', from: '2025-01-01', through: null }
		],
		assignments: [
			{ date: '2026-10-16', assignmentTypeId: 'staff-duty', assigneeId: 'person-0', source: 'manual' },
			{ date: '2026-10-17', assignmentTypeId: 'staff-duty', assigneeId: 'person-499', source: 'manual' }
		]
	});
	const limited = {
		...facts,
		people: enginePeople(bounded),
		excusals: facts.excusals.filter(({ through }) => through === null || through >= span.from)
	};
	const fullRun = simulateRoster(facts, { kind: 'fill', days: span });
	const limitedRun = simulateRoster(limited, { kind: 'fill', days: span });
	expect({ ...limitedRun, facts: null }).toEqual({ ...fullRun, facts: null });
	expect(closeForm(limited, span.through)).toEqual(closeForm(facts, span.through));
	expect(da6Segment(simulateRoster(limited), '2026-10')).toEqual(da6Segment(simulateRoster(facts), '2026-10'));
	expect(bounded.find(({ id }) => id === 'person-499')?.states.map(({ from }) => from)).toEqual([
		'2026-10-01',
		'2026-10-20'
	]);
	expect(bounded.some(({ id }) => id === 'person-496')).toBe(false);
	const bytes = (people: PersonnelAttributeTimeline[]) => Buffer.byteLength(JSON.stringify(people));
	if (process.env.ROSTER_PAYLOAD_REPORT === '1')
		process.stdout.write(
			JSON.stringify({
				workload: '400 active and 100 archived people, 36 monthly states plus one change',
				fullPeople: full.length,
				boundedPeople: bounded.length,
				fullStates: full.reduce((n, p) => n + p.states.length, 0),
				boundedStates: bounded.reduce((n, p) => n + p.states.length, 0),
				fullBytes: bytes(full),
				boundedBytes: bytes(bounded)
			}) + '\n'
		);
});

describe('bounded roster loader', () => {
	it('loads the baseline and in-period changes and only overlapping excusals', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		const org = ctx.auth.orgId;
		ctx.store.seed('personnel', [
			{
				id: 'able',
				organization_id: org,
				rank: 'SPC',
				last_name: 'Able',
				first_name: 'A',
				mos: '68W',
				created_at: '2023-01-01',
				archived_at: null
			}
		]);
		ctx.store.seed(
			'personnel_attribute_history',
			['2023-01-01', '2026-10-01', '2026-10-20', '2026-11-01'].map((effective_on) => ({
				organization_id: org,
				personnel_id: 'able',
				effective_on,
				rank: 'SPC',
				mos: '68W',
				clinic_role: '',
				group_id: null,
				archived: false
			}))
		);
		ctx.store.seed('assignment_types', [
			{ id: 'cq', organization_id: org, name: 'CQ', assign_to: 'personnel', archived_at: null }
		]);
		ctx.store.seed('roster_forms', [
			{
				id: 'form',
				organization_id: org,
				assignment_type_id: 'cq',
				starts_on: span.from,
				ends_on: null,
				rules: { pool: null, weekendMode: 'same' }
			}
		]);
		ctx.store.seed('roster_excusals', [
			{
				id: 'old',
				organization_id: org,
				assignment_type_id: 'cq',
				personnel_id: 'able',
				reason: 'Old',
				starts_on: '2023-01-01',
				ends_on: '2026-10-14'
			},
			{
				id: 'current',
				organization_id: org,
				assignment_type_id: 'cq',
				personnel_id: 'able',
				reason: 'Current',
				starts_on: '2026-10-15',
				ends_on: '2026-10-15'
			}
		]);
		const [facts] = await loadRosters(ctx, { today: span.from, window: span });
		expect(facts.people[0].states.map(({ from }) => from)).toEqual(['2026-10-01', '2026-10-20', '2026-11-01']);
		expect(facts.excusals).toEqual([
			{ personId: 'able', reason: 'Current', from: '2026-10-15', through: '2026-10-15' }
		]);
	});
});
