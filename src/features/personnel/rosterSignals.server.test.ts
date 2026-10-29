import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '$lib/server/database';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { projectOrganizationAccessGrant } from '$lib/access/memberAccessProjection';
import type { CapabilityLevel } from '$lib/access/memberAccessShape';
import { NO_SIGNAL_ACCESS, rosterAttentionCell, type RosterSourceRead, type SignalAccess } from './rosterSignals';
import {
	createSupabaseRosterCounselingSignals,
	createSupabaseRosterFollowUpSignals,
	createSupabaseRosterSignalSlices,
	loadRosterSignals,
	resolveSignalAccess,
	type RosterSignalSources
} from './rosterSignals.server';

const AS_OF = '2026-10-23';
const LEAVE = { id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#ffffff', sortOrder: 0 };

function grant(
	lanes: Partial<Record<'calendar' | 'personnel' | 'training' | 'criticalTasks' | 'ratingScheme', CapabilityLevel>>,
	scope: 'organization' | 'groups',
	disabledFeatures: FeatureKey[] = []
) {
	const capabilities = {
		calendar: 'none',
		personnel: 'view',
		training: 'none',
		criticalTasks: 'none',
		ratingScheme: 'none',
		...lanes
	};
	return projectOrganizationAccessGrant(
		{
			role: 'member',
			member_preset: 'viewer',
			capability_overrides: capabilities,
			access_scope_kind: scope,
			access_scope_group_ids: scope === 'groups' ? ['group-1'] : [],
			covered_group_ids: scope === 'groups' ? ['group-1'] : []
		},
		'user-1',
		'org-1',
		{ disabledFeatures }
	);
}

const EVERY_LANE = {
	calendar: 'view',
	personnel: 'configure',
	training: 'view',
	criticalTasks: 'view',
	ratingScheme: 'view'
} as const;
const ALL: SignalAccess = {
	availability: true,
	training: true,
	criticalTasks: true,
	evaluations: true,
	followUps: true,
	counseling: true
};

describe('resolveSignalAccess', () => {
	it('reads every source for an Organization-wide or Group-scoped reader of every lane', () => {
		expect(resolveSignalAccess(grant(EVERY_LANE, 'organization'), [])).toEqual(ALL);
		expect(resolveSignalAccess(grant(EVERY_LANE, 'groups'), [])).toEqual(ALL);
	});

	it('withholds each source its lane does not grant, and follow-ups and counseling below Personnel configure', () => {
		expect(resolveSignalAccess(grant({ personnel: 'operate', training: 'view' }, 'groups'), [])).toEqual({
			...NO_SIGNAL_ACCESS,
			training: true
		});
	});

	it('withholds a source whose feature the unit turned off', () => {
		const off: FeatureKey[] = ['training', 'evaluations'];
		expect(resolveSignalAccess(grant(EVERY_LANE, 'organization', off), off)).toEqual({
			...ALL,
			training: false,
			evaluations: false
		});
	});
});

function sources(overrides: Partial<RosterSignalSources> = {}): RosterSignalSources {
	const unread = (name: string) => vi.fn(() => Promise.reject(new Error(`${name} read while withheld`)));
	return {
		availability: unread('availability'),
		training: unread('training'),
		criticalTasks: unread('criticalTasks'),
		evaluations: unread('evaluations'),
		followUps: unread('followUps'),
		counseling: unread('counseling'),
		...overrides
	} as RosterSignalSources;
}

const map = <T>(entries: [string, T][]): RosterSourceRead<T> => new Map(entries);

describe('loadRosterSignals', () => {
	it('reads only the sources the viewer may read and leaves the rest withheld', async () => {
		const read = sources({
			training: vi.fn(async () =>
				map([
					[
						'a',
						{
							items: [
								{
									typeId: 'cpr',
									name: 'CPR/BLS',
									status: 'expired' as const,
									daysUntilExpiration: -22,
									cycleMonths: 24,
									applicability: { kind: 'all' as const },
									completion: { completionDate: '2024-10-01', expirationDate: '2026-10-01' }
								}
							]
						}
					],
					['b', { items: [] }]
				])
			)
		});
		const signals = await loadRosterSignals(
			{ access: { ...NO_SIGNAL_ACCESS, training: true }, sources: read },
			{ asOf: AS_OF, personnelIds: null }
		);

		for (const source of ['availability', 'criticalTasks', 'evaluations', 'followUps', 'counseling'] as const) {
			expect(read[source]).not.toHaveBeenCalled();
		}
		expect(signals.statusTypes).toEqual([]);
		expect(
			signals.people.map((person) => [
				person.personnelId,
				person.today,
				rosterAttentionCell({ kind: 'ready', value: { ...person, loss: null } })
			])
		).toEqual([
			['a', { kind: 'withheld' }, { kind: 'item', text: 'CPR/BLS expired', more: 0, tone: 'red' }],
			['b', { kind: 'withheld' }, { kind: 'clear' }]
		]);
	});

	it('combines every source into one core per visible Person', async () => {
		const signals = await loadRosterSignals(
			{
				access: ALL,
				sources: sources({
					availability: vi.fn(async () => ({
						statusTypes: [LEAVE],
						today: map([
							['a', { kind: 'away' as const, statusTypeId: 'leave' }],
							['b', { kind: 'present' as const }]
						])
					})),
					training: vi.fn(async () =>
						map([
							['a', { items: [] }],
							['b', { items: [] }]
						])
					),
					criticalTasks: vi.fn(async () =>
						map([
							['a', { items: [] }],
							['b', { items: [] }]
						])
					),
					evaluations: vi.fn(async () =>
						map([
							['a', null],
							['b', null]
						])
					),
					followUps: vi.fn(async () =>
						map([
							['a', []],
							['b', [{ id: 'f1', title: 'Call home', dueDate: '2026-10-20' }]]
						])
					),
					counseling: vi.fn(async () =>
						map([
							['a', ['2026-10-01']],
							['b', []]
						])
					)
				})
			},
			{ asOf: AS_OF, personnelIds: null }
		);

		expect(signals.statusTypes).toEqual([LEAVE]);
		expect(signals.people).toEqual([
			{
				personnelId: 'a',
				today: { kind: 'known', value: { kind: 'away', statusTypeId: 'leave' } },
				attention: { kind: 'known', value: { kind: 'clear' } },
				matches: {},
				openFollowUps: { kind: 'known', value: { count: 0, first: null } }
			},
			{
				personnelId: 'b',
				today: { kind: 'known', value: { kind: 'present' } },
				attention: {
					kind: 'known',
					value: {
						kind: 'attention',
						first: { kind: 'follow-ups', status: 'overdue', count: 1 },
						otherCount: 0,
						worst: 'red'
					}
				},
				matches: {
					'follow-ups': { item: { kind: 'follow-ups', status: 'overdue', count: 1 }, otherCount: 0 },
					counseling: true
				},
				openFollowUps: {
					kind: 'known',
					value: { count: 1, first: { id: 'f1', title: 'Call home', dueDate: '2026-10-20' } }
				}
			}
		]);
	});

	it('asks every readable source for the listed People only', async () => {
		const training = vi.fn(async () => map<{ items: [] }>([]));
		const followUps = vi.fn(async () => map<[]>([]));
		await loadRosterSignals(
			{ access: { ...NO_SIGNAL_ACCESS, training: true, followUps: true }, sources: sources({ training, followUps }) },
			{ asOf: AS_OF, personnelIds: ['a'] }
		);
		expect(training).toHaveBeenCalledWith({ asOf: AS_OF, personnelIds: ['a'] });
		expect(followUps).toHaveBeenCalledWith({ asOf: AS_OF, personnelIds: ['a'] });
	});

	it('fails the whole lane when a readable source fails', async () => {
		await expect(
			loadRosterSignals(
				{ access: { ...NO_SIGNAL_ACCESS, followUps: true }, sources: sources() },
				{ asOf: AS_OF, personnelIds: null }
			)
		).rejects.toThrow('followUps read while withheld');
	});
});

function rpcClient(data: unknown, error: { message: string } | null = null) {
	const rpc = vi.fn(async () => ({ data, error }));
	return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('Personnel signal readers', () => {
	it('reads every readable source in one statement shared by all of them', async () => {
		const { client, rpc } = rpcClient({ training: { cohort: [] }, followUps: { cohort: [], open: [] } });
		const access = { ...NO_SIGNAL_ACCESS, training: true, followUps: true };
		const slices = createSupabaseRosterSignalSlices(client, 'org-1', access);
		const query = { asOf: AS_OF, personnelIds: ['a', 'b'] };
		expect(await Promise.all([slices('training', query), slices('followUps', query)])).toEqual([
			{ cohort: [] },
			{ cohort: [], open: [] }
		]);
		expect(rpc).toHaveBeenCalledTimes(1);
		expect(rpc).toHaveBeenCalledWith('roster_signals', {
			p_organization_id: 'org-1',
			p_as_of: AS_OF,
			p_since: '2025-11-01',
			p_sources: ['training', 'followUps'],
			p_personnel_ids: ['a', 'b']
		});
	});

	it('reads again for a new query', async () => {
		const { client, rpc } = rpcClient({ training: null });
		const slices = createSupabaseRosterSignalSlices(client, 'org-1', { ...NO_SIGNAL_ACCESS, training: true });
		await slices('training', { asOf: AS_OF, personnelIds: null });
		await slices('training', { asOf: AS_OF, personnelIds: null });
		expect(rpc).toHaveBeenCalledTimes(2);
	});

	it('groups open follow-ups by Person and gives every cohort member a list', async () => {
		const slices = vi.fn(async () => ({
			cohort: ['a', 'b'],
			open: [
				['f2', 'a', 'Call home', '2026-10-20'],
				['f1', 'a', 'Undated', null]
			]
		}));
		const query = { asOf: AS_OF, personnelIds: null };
		const read = await createSupabaseRosterFollowUpSignals(slices)(query);
		expect(slices).toHaveBeenCalledWith('followUps', query);
		expect([...read]).toEqual([
			[
				'a',
				[
					{ id: 'f2', title: 'Call home', dueDate: '2026-10-20' },
					{ id: 'f1', title: 'Undated', dueDate: null }
				]
			],
			['b', []]
		]);
	});

	it('gives every cohort member the latest counseling inside the window', async () => {
		const slices = vi.fn(async () => ({ cohort: ['a', 'b'], latest: [['a', '2026-03-10']] }));
		const query = { asOf: AS_OF, personnelIds: ['a', 'b'] };
		const read = await createSupabaseRosterCounselingSignals(slices)(query);
		expect(slices).toHaveBeenCalledWith('counseling', query);
		expect([...read]).toEqual([
			['a', ['2026-03-10']],
			['b', []]
		]);
	});

	it('fails every source when the statement fails', async () => {
		const { client } = rpcClient(null, { message: 'statement timeout' });
		const slices = createSupabaseRosterSignalSlices(client, 'org-1', { ...NO_SIGNAL_ACCESS, followUps: true });
		await expect(createSupabaseRosterFollowUpSignals(slices)({ asOf: AS_OF, personnelIds: null })).rejects.toThrow(
			'statement timeout'
		);
	});
});
