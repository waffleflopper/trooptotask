import { afterEach, describe, expect, it } from 'vitest';
import type { PersonnelArchivedArtifact } from './contracts';
import {
	archivedDetail,
	archivedStamp,
	archivedTitle,
	dueLabel,
	formatTimestampDayMonth,
	groupFollowUps
} from './logModel';
import { makeFollowUp, makeLeaderNote } from './logFixtures.testHelper';

const TODAY = '2026-10-19';

describe('dueLabel', () => {
	it.each([
		{ dueDate: '2026-10-17', expected: { text: 'Overdue 2 days', overdue: true } },
		{ dueDate: '2026-10-18', expected: { text: 'Overdue 1 day', overdue: true } },
		{ dueDate: '2026-10-19', expected: { text: 'Mon 19 Oct', overdue: false } },
		{ dueDate: '2026-10-22', expected: { text: 'Thu 22 Oct', overdue: false } },
		{ dueDate: '2026-11-05', expected: { text: 'Thu 5 Nov', overdue: false } },
		{ dueDate: null, expected: { text: 'No due date', overdue: false } }
	])('labels a follow-up due $dueDate on $expected.text', ({ dueDate, expected }) => {
		expect(dueLabel(dueDate, TODAY)).toEqual(expected);
	});
});

describe('groupFollowUps', () => {
	const rows = [
		makeFollowUp({ id: 'undated', dueDate: null }),
		makeFollowUp({ id: 'later', dueDate: '2026-10-30' }),
		makeFollowUp({ id: 'late', dueDate: '2026-10-10' }),
		makeFollowUp({ id: 'today', dueDate: TODAY }),
		makeFollowUp({ id: 'done-old', status: 'completed', completedAt: '2026-10-02T09:00:00.000Z' }),
		makeFollowUp({ id: 'done-new', status: 'completed', completedAt: '2026-10-12T09:00:00.000Z' }),
		makeFollowUp({ id: 'gone', status: 'archived' })
	];

	it('orders open follow-ups by due date with undated last and counts the overdue ones', () => {
		const groups = groupFollowUps(rows, TODAY);

		expect(groups.open.map((row) => row.id)).toEqual(['late', 'today', 'later', 'undated']);
		expect(groups.overdue).toBe(1);
	});

	it('lists completed follow-ups newest first and leaves archived ones out', () => {
		const groups = groupFollowUps(rows, TODAY);

		expect(groups.completed.map((row) => row.id)).toEqual(['done-new', 'done-old']);
	});
});

describe('archived records', () => {
	const followUp: PersonnelArchivedArtifact = {
		kind: 'follow-up',
		...makeFollowUp({
			status: 'completed',
			completedAt: '2026-10-05T10:00:00.000Z',
			dueDate: '2026-09-08',
			archivedAt: '2026-10-14T15:00:00.000Z',
			archivedBy: 'SFC Diaz'
		})
	};
	const note: PersonnelArchivedArtifact = {
		kind: 'note',
		...makeLeaderNote({ text: 'Late to formation', archivedAt: '2026-10-16T15:00:00.000Z' })
	};

	it('describes a follow-up by its state, due date and creator', () => {
		expect(archivedDetail(followUp)).toBe('Completed · due 8 Sep · created by 1SG Ramos');
	});

	it('quotes a note as its own title', () => {
		expect(archivedTitle(note)).toBe('“Late to formation”');
	});

	it('stamps who archived an item, and omits the name when none was recorded', () => {
		expect(archivedStamp(followUp)).toBe('Archived 14 Oct · SFC Diaz');
		expect(archivedStamp(note)).toBe('Archived 16 Oct');
	});
});

describe('formatTimestampDayMonth', () => {
	const originalTimezone = process.env.TZ;
	afterEach(() => {
		if (originalTimezone === undefined) delete process.env.TZ;
		else process.env.TZ = originalTimezone;
	});

	it('dates a timestamp by the viewer local day', () => {
		process.env.TZ = 'America/New_York';

		expect(formatTimestampDayMonth('2026-10-15T00:30:00.000Z')).toBe('14 Oct');
	});
});
