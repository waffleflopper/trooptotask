import { describe, expect, it } from 'vitest';
import type { PersonnelLookup } from '$features/personnel/contracts';
import type { RatingSchemeEntry } from '../rating-scheme.types';
import { groupRatingSchemeEntries } from './ratingSchemeGroups';

const today = new Date('2026-05-01T12:00:00');
const personnel: PersonnelLookup[] = [
	{ id: 'senior-bravo', rank: 'COL', lastName: 'Bravo', firstName: 'Bea' },
	{ id: 'rater-zulu', rank: 'MAJ', lastName: 'Zulu', firstName: 'Zoe' }
];

function entry(id: string, overrides: Partial<RatingSchemeEntry> = {}): RatingSchemeEntry {
	return {
		id,
		ratedPersonId: 'rated-1',
		evalType: 'NCOER',
		raterPersonId: null,
		raterName: 'Alpha rater',
		seniorRaterPersonId: null,
		seniorRaterName: 'Zulu senior',
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2025-01-01',
		ratingPeriodEnd: '2026-05-31',
		status: 'active',
		notes: null,
		reportType: 'AN',
		workflowStatus: null,
		...overrides
	};
}

const entries = [
	entry('completed-senior', { seniorRaterName: 'Alpha senior', status: 'completed', ratingPeriodEnd: '2025-01-01' }),
	entry('bravo', { seniorRaterPersonId: 'senior-bravo', seniorRaterName: 'ignored name' }),
	entry('delta', { seniorRaterName: 'Delta senior' }),
	entry('later-in-alpha', { ratingPeriodEnd: '2026-06-30' }),
	entry('beta-rater', { raterName: 'Beta rater' }),
	entry('completed-rater', { raterName: 'A completed rater', status: 'completed', ratingPeriodEnd: '2025-01-01' }),
	entry('urgent-later', { raterPersonId: 'rater-zulu', raterName: 'ignored rater', ratingPeriodEnd: '2026-04-20' }),
	entry('earlier-in-alpha'),
	entry('current', { raterName: 'Current rater', ratingPeriodEnd: '2026-07-01' }),
	entry('urgent-first', { raterPersonId: 'rater-zulu', ratingPeriodEnd: '2026-01-01', status: 'change-of-rater' }),
	entry('unassigned-rater', { raterName: null, ratingPeriodEnd: '2025-12-01' }),
	entry('unassigned-senior', { seniorRaterName: null, ratingPeriodEnd: '2025-01-01' })
];

describe('groupRatingSchemeEntries', () => {
	it('orders senior raters and raters by their earliest open thru date, with unassigned last', () => {
		const groups = groupRatingSchemeEntries(entries, personnel, 'urgency', today);
		expect(groups.map((group) => group.key)).toEqual([
			'Zulu senior',
			'senior-bravo',
			'Delta senior',
			'Alpha senior',
			'unassigned'
		]);
		expect(groups[0].raterGroups.map((group) => group.key)).toEqual([
			'rater-zulu',
			'Alpha rater',
			'Beta rater',
			'Current rater',
			'A completed rater',
			'unassigned'
		]);
		expect(groups[0].raterGroups[0].entries.map((item) => item.id)).toEqual(['urgent-first', 'urgent-later']);
		expect(groups[0].raterGroups[1].entries.map((item) => item.id)).toEqual(['earlier-in-alpha', 'later-in-alpha']);
		expect(groups[0].entryCount).toBe(8);
		expect(groups[0].dueCounts).toEqual({ overdue: 3, 'due-30': 2, 'due-60': 1 });
		expect(groups[3].dueCounts).toEqual({ overdue: 0, 'due-30': 0, 'due-60': 0 });
		expect(entries.map((item) => item.id)).toEqual([
			'completed-senior',
			'bravo',
			'delta',
			'later-in-alpha',
			'beta-rater',
			'completed-rater',
			'urgent-later',
			'earlier-in-alpha',
			'current',
			'urgent-first',
			'unassigned-rater',
			'unassigned-senior'
		]);
	});

	it('orders both group levels by label in A to Z mode, including completed groups', () => {
		const groups = groupRatingSchemeEntries(entries, personnel, 'seniorRaterAZ', today);
		expect(groups.map((group) => group.key)).toEqual([
			'Alpha senior',
			'senior-bravo',
			'Delta senior',
			'Zulu senior',
			'unassigned'
		]);
		expect(groups[3].raterGroups.map((group) => group.key)).toEqual([
			'A completed rater',
			'Alpha rater',
			'Beta rater',
			'Current rater',
			'rater-zulu',
			'unassigned'
		]);
		expect(groups[1]).toMatchObject({ key: 'senior-bravo', label: 'COL Bravo, Bea', external: false });
		expect(groups[3]).toMatchObject({ key: 'Zulu senior', label: 'Zulu senior', external: true });
		expect(groups[3].raterGroups[4]).toMatchObject({ key: 'rater-zulu', label: 'MAJ Zulu, Zoe', external: false });
		expect(groups[4]).toMatchObject({ key: 'unassigned', label: 'Not Set', external: false });
	});

	it('orders unit senior raters by surname, not rank, in A to Z mode', () => {
		const groups = groupRatingSchemeEntries(
			[entry('zulu', { seniorRaterPersonId: 'senior-zulu' }), entry('adams', { seniorRaterPersonId: 'senior-adams' })],
			[
				{ id: 'senior-zulu', rank: 'COL', lastName: 'Zulu', firstName: 'Zed' },
				{ id: 'senior-adams', rank: 'MAJ', lastName: 'Adams', firstName: 'Amy' }
			],
			'seniorRaterAZ',
			today
		);
		expect(groups.map((group) => group.label)).toEqual(['MAJ Adams, Amy', 'COL Zulu, Zed']);
	});

	it("lists a rater's open entries before older completed ones", () => {
		const groups = groupRatingSchemeEntries(
			[
				entry('done', { status: 'completed', ratingPeriodEnd: '2025-01-01' }),
				entry('open', { ratingPeriodEnd: '2026-06-30' })
			],
			personnel,
			'urgency',
			today
		);
		expect(groups[0].raterGroups[0].entries.map((item) => item.id)).toEqual(['open', 'done']);
	});

	it('keeps a missing person separate from typed names and handles an empty list', () => {
		const groups = groupRatingSchemeEntries(
			[entry('missing', { seniorRaterPersonId: 'missing-person', raterPersonId: 'missing-rater' })],
			[],
			'urgency',
			today
		);
		expect(groups[0]).toMatchObject({ key: 'missing-person', label: 'Unknown', external: false });
		expect(groups[0].raterGroups[0]).toMatchObject({ key: 'missing-rater', label: 'Unknown', external: false });
		expect(groupRatingSchemeEntries([], personnel, 'urgency', today)).toEqual([]);
	});
});
