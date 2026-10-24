import { describe, expect, it } from 'vitest';
import type { Personnel } from './personnel.types';
import type { AttentionInput } from './personnelReadiness.types';
import {
	buildPersonSignalCore,
	changesSignalApplicability,
	NO_SIGNAL_ACCESS,
	projectRosterLosses,
	rosterAttentionCell,
	summarizeRosterSignals,
	type Known,
	type OpenFollowUp,
	type PersonRosterSignals,
	type RosterStatusType,
	type SignalAccess,
	type TodayStatus
} from './rosterSignals';

const AS_OF = '2026-10-23';
const ALL: SignalAccess = {
	availability: true,
	training: true,
	criticalTasks: true,
	evaluations: true,
	followUps: true,
	counseling: true
};
const TDY: RosterStatusType = { id: 'tdy', name: 'TDY', color: '#2563eb', textColor: '#fff', sortOrder: 0 };
const LEAVE: RosterStatusType = { id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#fff', sortOrder: 1 };

type TrainingItem = Extract<AttentionInput['training'], { ok: true }>['value']['items'][number];
type TaskItem = Extract<AttentionInput['criticalTasks'], { ok: true }>['value']['items'][number];

function training(name: string, status: TrainingItem['status'], days: number | null): TrainingItem {
	return {
		typeId: name,
		name,
		status,
		daysUntilExpiration: days,
		cycleMonths: 12,
		applicability: { kind: 'all' },
		completion: null
	};
}

function task(name: string, status: TaskItem['status'], days: number | null): TaskItem {
	return { taskId: name, taskCode: name, name, status, daysUntilExpiration: days, expirationDate: null, latest: null };
}

function evaluation(daysUntilThru: number, dueStatus: 'current' | 'due-60' | 'due-30' | 'overdue') {
	return {
		ok: true as const,
		value: {
			entryId: 'eval',
			evalType: 'Annual',
			reportTypeLabel: 'NCOER',
			periodEnd: '2026-12-07',
			daysUntilThru,
			dueStatus,
			phase: { label: 'Drafting' },
			rater: null
		}
	};
}

function core(
	personnelId: string,
	sources: {
		today?: Known<TodayStatus>;
		training?: TrainingItem[];
		tasks?: TaskItem[];
		evaluation?: AttentionInput['evaluation'];
		followUps?: OpenFollowUp[] | null;
		counseling?: string[] | null;
	} = {}
) {
	return buildPersonSignalCore({
		personnelId,
		asOf: AS_OF,
		today: sources.today ?? { kind: 'known', value: { kind: 'present' } },
		training: { ok: true, value: { items: sources.training ?? [] } },
		criticalTasks: { ok: true, value: { items: sources.tasks ?? [] } },
		evaluation: sources.evaluation ?? { ok: true, value: null },
		openFollowUps:
			sources.followUps === null ? { kind: 'withheld' } : { kind: 'known', value: sources.followUps ?? [] },
		counselingDates:
			sources.counseling === null ? { kind: 'withheld' } : { kind: 'known', value: sources.counseling ?? [AS_OF] }
	});
}

function row(signals: ReturnType<typeof core>): PersonRosterSignals {
	return { ...signals, loss: null };
}

function ready(signals: ReturnType<typeof core>) {
	return { kind: 'ready' as const, value: row(signals) };
}

const overdue = (id: string, dueDate: string | null = '2026-10-20'): OpenFollowUp => ({ id, title: id, dueDate });

describe('buildPersonSignalCore', () => {
	const a = core('a', {
		training: [training('CPR/BLS', 'expired', -12), training('HIPAA', 'current', 200)],
		tasks: [task('Airway', 'expiring', 2)],
		followUps: [overdue('f1'), overdue('f2')]
	});
	const b = core('b', { training: [training('SHARP', 'missing', null)] });
	const c = core('c', { evaluation: evaluation(45, 'due-60') });
	const d = core('d');

	it('shows the most urgent item and counts every other issue, follow-ups by their number', () => {
		expect(rosterAttentionCell(ready(a))).toEqual({ kind: 'item', text: 'CPR/BLS expired', more: 3, tone: 'red' });
		expect(rosterAttentionCell(ready(b))).toEqual({ kind: 'item', text: 'SHARP missing', more: 0, tone: 'red' });
		expect(rosterAttentionCell(ready(c))).toEqual({ kind: 'item', text: 'NCOER Annual due', more: 0, tone: 'amber' });
		expect(rosterAttentionCell(ready(d))).toEqual({ kind: 'clear' });
	});

	it('shows the item that matched the active chip instead of the most urgent one', () => {
		expect(rosterAttentionCell(ready(a), { kind: 'chip', chip: 'follow-ups' })).toEqual({
			kind: 'item',
			text: '2 follow-ups overdue',
			more: 0,
			tone: 'red'
		});
		expect(rosterAttentionCell(ready(a), { kind: 'chip', chip: 'expiring' })).toEqual({
			kind: 'item',
			text: 'Airway expiring',
			more: 0,
			tone: 'amber'
		});
	});

	it('counts each Person once for attention and for every chip', () => {
		const summary = summarizeRosterSignals({
			rows: [a, b, c, d, a].map(row),
			access: ALL,
			lossesEnabled: false,
			statusTypes: []
		});
		expect(summary.people).toBe(4);
		expect(summary.attention).toEqual({ kind: 'known', value: { people: 3, worst: 'red' } });
		expect(summary.chips).toEqual([
			{ chip: 'expired', people: 2 },
			{ chip: 'expiring', people: 2 },
			{ chip: 'follow-ups', people: 1 },
			{ chip: 'not-present', people: 0 },
			{ chip: 'counseling', people: 0 }
		]);
	});

	it('keeps an overdue follow-up after a nearer expiring item, colors the cell by it, and the Group by the worst', () => {
		const person = core('p', { training: [training('SHARP', 'expiring', 2)], followUps: [overdue('f')] });
		expect(rosterAttentionCell(ready(person))).toEqual({
			kind: 'item',
			text: 'SHARP expiring',
			more: 1,
			tone: 'amber'
		});
		const group = summarizeRosterSignals({ rows: [row(person)], access: ALL, lossesEnabled: false, statusTypes: [] });
		expect(group.attention).toEqual({ kind: 'known', value: { people: 1, worst: 'red' } });
	});

	it('does not count a follow-up due today or with no date as overdue', () => {
		const person = core('p', { followUps: [overdue('today', AS_OF), overdue('undated', null)] });
		expect(rosterAttentionCell(ready(person))).toEqual({ kind: 'clear' });
		expect(person.openFollowUps).toEqual({
			kind: 'known',
			value: { count: 2, first: { id: 'today', title: 'today', dueDate: AS_OF } }
		});
	});

	it('matches Expiring within 30 days at 30 but not 31, never a current item, and every due evaluation', () => {
		expect(core('p', { training: [training('T', 'expiring', 30)] }).matches.expiring).toBeDefined();
		expect(core('p', { training: [training('T', 'expiring', 31)] }).matches.expiring).toBeUndefined();
		expect(core('p', { training: [training('T', 'current', 20)] }).matches.expiring).toBeUndefined();
		expect(core('p', { evaluation: evaluation(45, 'due-60') }).matches.expiring).toBeDefined();
		const lapsed = core('p', { training: [training('T', 'expired', -1)] });
		expect([lapsed.matches.expired?.item, lapsed.matches.expiring]).toEqual([
			{ kind: 'training', status: 'expired', title: 'T', days: -1 },
			undefined
		]);
	});

	it('colors an overdue evaluation red and says it is overdue', () => {
		expect(rosterAttentionCell(ready(core('p', { evaluation: evaluation(-3, 'overdue') })))).toEqual({
			kind: 'item',
			text: 'NCOER Annual overdue',
			more: 0,
			tone: 'red'
		});
	});

	it('marks counseling due only when no counseling falls in the current and previous eleven months', () => {
		const due = (dates: string[]) => core('p', { counseling: dates }).matches.counseling ?? false;
		expect(due(['2025-11-01'])).toBe(false);
		expect(due(['2025-10-31'])).toBe(true);
		expect(due(['2026-10-24'])).toBe(true);
		expect(due(['2025-10-31', '2025-10-31'])).toBe(true);
		expect(due([])).toBe(true);
	});

	it('never shows withheld sources as clear', () => {
		const withheld = buildPersonSignalCore({
			personnelId: 'p',
			asOf: AS_OF,
			today: { kind: 'withheld' },
			training: { ok: false, off: true },
			criticalTasks: { ok: false, off: true },
			evaluation: { ok: false, off: true },
			openFollowUps: { kind: 'withheld' },
			counselingDates: { kind: 'withheld' }
		});
		expect(rosterAttentionCell(ready(withheld))).toEqual({ kind: 'blank' });
		expect(withheld.matches).toEqual({});
		const summary = summarizeRosterSignals({
			rows: [row(withheld)],
			access: NO_SIGNAL_ACCESS,
			lossesEnabled: false,
			statusTypes: []
		});
		expect(summary).toEqual({ people: 1, presence: { kind: 'withheld' }, attention: { kind: 'withheld' }, chips: [] });
	});

	it('shows the pending lane as a skeleton and a failed one as a blank cell', () => {
		expect(rosterAttentionCell({ kind: 'pending' })).toEqual({ kind: 'skeleton' });
		expect(rosterAttentionCell({ kind: 'failed' })).toEqual({ kind: 'blank' });
	});
});

describe('summarizeRosterSignals presence', () => {
	it('counts People present and away by status in status-type order', () => {
		const away = (statusTypeId: string): Known<TodayStatus> => ({
			kind: 'known',
			value: { kind: 'away', statusTypeId }
		});
		const summary = summarizeRosterSignals({
			rows: [core('a', { today: away('leave') }), core('b', { today: away('tdy') }), core('c'), core('d')].map(row),
			access: ALL,
			lossesEnabled: false,
			statusTypes: [TDY, LEAVE]
		});
		expect(summary.presence).toEqual({
			kind: 'known',
			value: {
				statusRead: 4,
				present: 2,
				byStatus: [
					{ type: TDY, count: 1 },
					{ type: LEAVE, count: 1 }
				]
			}
		});
	});
});

describe('summarizeRosterSignals presence with withheld statuses', () => {
	it('counts only People whose status was read, so present never exceeds the counted People', () => {
		const summary = summarizeRosterSignals({
			rows: [core('a'), core('b', { today: { kind: 'withheld' } })].map(row),
			access: ALL,
			lossesEnabled: false,
			statusTypes: [LEAVE]
		});
		expect(summary.people).toBe(2);
		expect(summary.presence).toEqual({ kind: 'known', value: { statusRead: 1, present: 1, byStatus: [] } });
	});
});

describe('projectRosterLosses', () => {
	const person = (id: string, ets: string | null, deros: string | null = null): Personnel => ({
		id,
		rank: 'SGT',
		lastName: id,
		firstName: id,
		mos: '68W',
		clinicRole: '',
		ets,
		deros,
		groupId: null,
		groupName: ''
	});
	const project = (people: Personnel[], lossWarningWindowDays: number | null = 30) =>
		projectRosterLosses({
			people,
			asOf: AS_OF,
			lossWarningWindowDays,
			lossesEnabled: true,
			awardTrackingAcknowledgedPersonnelIds: []
		});

	it('matches the 90-day chip from 0 through 90 days, whatever the unit window', () => {
		const losses = project([
			person('today', AS_OF),
			person('day90', '2027-01-21'),
			person('day91', '2027-01-22'),
			person('past', '2026-10-22')
		]);
		expect([...losses].map(([id, loss]) => [id, loss.chip?.daysRemaining ?? null])).toEqual([
			['today', 0],
			['day90', 90]
		]);
	});

	it('shows the badge only inside the unit window, and the chip still applies outside it', () => {
		const losses = project([person('sixty', '2026-12-22')]);
		expect(losses.get('sixty')).toMatchObject({ badge: null, chip: { triggerType: 'ETS', daysRemaining: 60 } });
		expect(project([person('sixty', '2026-12-22')], null).get('sixty')).toMatchObject({ badge: null });
	});

	it('gives one loss for a Person with ETS and PCS, the nearer date', () => {
		const loss = project([person('both', '2026-11-12', '2026-11-04')]).get('both');
		expect([loss?.badge?.triggerType, loss?.badge?.daysRemaining]).toEqual(['PCS / DEROS', 12]);
	});

	it('reads nothing while Losses and awards is off', () => {
		const losses = projectRosterLosses({
			people: [person('today', AS_OF)],
			asOf: AS_OF,
			lossWarningWindowDays: 30,
			lossesEnabled: false,
			awardTrackingAcknowledgedPersonnelIds: []
		});
		expect(losses.size).toBe(0);
	});
});

describe('changesSignalApplicability', () => {
	const before = { rank: 'SPC', mos: '68W', clinicRole: 'Medic', groupId: 'alpha' as string | null };

	it.each([
		['rank', { rank: 'SGT' }],
		['MOS', { mos: '11B' }],
		['duty role', { clinicRole: 'Lead' }],
		['Group', { groupId: 'bravo' }],
		['leaving every Group', { groupId: null }]
	])('is true when the %s changes', (_field, change) => {
		expect(changesSignalApplicability(before, { ...before, ...change })).toBe(true);
	});

	it('is false when nothing that decides applicability changed, including a Group left empty either way', () => {
		expect(changesSignalApplicability(before, { ...before })).toBe(false);
		expect(changesSignalApplicability({ ...before, groupId: null }, { ...before, groupId: undefined as never })).toBe(
			false
		);
	});
});
