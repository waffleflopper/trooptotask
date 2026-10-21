import { describe, expect, it } from 'vitest';
import type { LossCandidate } from '$features/personnel/contracts';
import {
	groupsUnderGoalSentence,
	lossWindowSentence,
	retentionSentence,
	type GroupReadiness
} from './policiesSettings';

const TODAY = '2026-10-21';

function person(id: string, rank: string, lastName: string, dates: Partial<LossCandidate>): LossCandidate {
	return { id, rank, lastName, ets: null, deros: null, groupId: null, ...dates };
}

const ROSTER = [
	person('kim', 'SGT', 'Kim', { ets: '2026-11-20' }),
	person('reed', 'SPC', 'Reed', { deros: '2027-03-02' }),
	person('diaz', 'PFC', 'Diaz', { ets: '2027-03-31' }),
	person('ortiz', 'SSG', 'Ortiz', { ets: '2027-04-10', deros: '2027-08-01' }),
	person('moss', 'CPL', 'Moss', { deros: '2027-06-01' }),
	person('hale', 'SPC', 'Hale', { ets: '2026-10-01' })
];

describe('lossWindowSentence', () => {
	it.each([
		[180, 'At 180 days, 4 people are flagged today.'],
		[
			30,
			"At 30 days, 1 person is flagged today (was 4 at 180). SPC Reed's PCS on 2 Mar 2027, PFC Diaz's ETS on 31 Mar 2027 and 1 other would drop off."
		],
		[165, "At 165 days, 3 people are flagged today (was 4 at 180). SSG Ortiz's ETS on 10 Apr 2027 would drop off."],
		[
			140,
			"At 140 days, 2 people are flagged today (was 4 at 180). PFC Diaz's ETS on 31 Mar 2027 and SSG Ortiz's ETS on 10 Apr 2027 would drop off."
		],
		[
			20,
			"At 20 days, no one is flagged today (was 4 at 180). SGT Kim's ETS on 20 Nov, SPC Reed's PCS on 2 Mar 2027 and 2 others would drop off."
		],
		[175, 'At 175 days, 4 people are flagged today (was 4 at 180).'],
		[240, "At 240 days, 5 people are flagged today (was 4 at 180). CPL Moss's PCS on 1 Jun 2027 would join."]
	])('at %i days against a saved 180', (days, sentence) => {
		expect(lossWindowSentence(ROSTER, days, 180, TODAY)).toBe(sentence);
	});

	it('names two people who join and counts the rest', () => {
		expect(lossWindowSentence(ROSTER, 365, 20, TODAY)).toBe(
			"At 365 days, 5 people are flagged today (was 0 at 20). SGT Kim's ETS on 20 Nov, SPC Reed's PCS on 2 Mar 2027 and 3 others would join."
		);
	});
});

const GROUPS: GroupReadiness[] = [
	{ name: '2nd PLT', ready: 81, applicable: 100, percent: 81 },
	{ name: 'Maint PLT', ready: 78, applicable: 100, percent: 78 },
	{ name: 'HQ PLT', ready: 95, applicable: 100, percent: 95 },
	{ name: '1st PLT', ready: 179, applicable: 200, percent: 90 }
];

describe('groupsUnderGoalSentence', () => {
	it.each([
		[85, "Today that's 2nd PLT (81%) and Maint PLT (78%)."],
		[80, "Today that's Maint PLT (78%)."],
		[75, 'Today every group meets it.'],
		[90, "Today that's 2nd PLT (81%), Maint PLT (78%) and 1 more group."],
		[100, "Today that's 2nd PLT (81%), Maint PLT (78%) and 2 more groups."]
	])('at a %i%% goal', (goal, sentence) => {
		expect(groupsUnderGoalSentence(GROUPS, goal)).toBe(sentence);
	});

	it('grades the exact share, as the heat map does, while showing the rounded percent', () => {
		expect(groupsUnderGoalSentence([GROUPS[3]], 90)).toBe("Today that's 1st PLT (90%).");
		expect(groupsUnderGoalSentence([GROUPS[3]], 89)).toBe('Today every group meets it.');
	});

	it('says when no group has training to measure', () => {
		expect(groupsUnderGoalSentence([], 85)).toBe('No group has required training to measure yet.');
	});
});

describe('retentionSentence', () => {
	const NOW = new Date('2026-10-21T12:00:00.000Z');

	it('dates the next deletion on the cleanup run day', () => {
		expect(retentionSentence('2024-11-02T03:00:00.000Z', 24, NOW)).toBe(
			'Archived people are deleted 24 months after archiving. The next one goes on 2 Nov 2026.'
		);
		expect(retentionSentence('2024-11-02T06:00:00.000Z', 24, NOW)).toBe(
			'Archived people are deleted 24 months after archiving. The next one goes on 3 Nov 2026.'
		);
	});

	it('dates an archive already past a shorter retention on the next run', () => {
		expect(retentionSentence('2024-11-02T03:00:00.000Z', 12, NOW)).toBe(
			'Archived people are deleted 12 months after archiving. The next one goes on 22 Oct 2026.'
		);
	});

	it('says when no one is archived', () => {
		expect(retentionSentence(null, 1, NOW)).toBe(
			'Archived people are deleted 1 month after archiving. No one is archived right now.'
		);
	});
});
