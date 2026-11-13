import { describe, expect, it } from 'vitest';
import { evaluation, line, linePersonnel } from './ratingSchemeLineTestData';
import { countChainRoles, groupRatingSchemeLines } from './ratingSchemeLineGroups';

const lines = [
	line('park', { ratedPersonId: 'park' }),
	line('watanabe-late', {
		ratedPersonId: 'watanabe',
		open: evaluation('e1', 'watanabe-late', { ratingPeriodEnd: '2026-09-01' })
	}),
	line('reyes-line', {
		ratedPersonId: 'reyes',
		raterPersonId: null,
		raterName: 'Maj. Outside',
		seniorRaterPersonId: null,
		seniorRaterName: 'LTC Holt',
		open: evaluation('e2', 'reyes-line', { ratingPeriodEnd: '2026-03-01' })
	}),
	line('no-senior', { seniorRaterPersonId: null, seniorRaterName: null })
];

describe('groupRatingSchemeLines', () => {
	it('groups senior rater, then rater, and sorts Rated Soldiers by last name', () => {
		const groups = groupRatingSchemeLines(lines, linePersonnel, 'seniorRaterAZ');
		const chen = groups.find((group) => group.key === 'chen');
		expect(chen?.label).toBe('1LT Wei Chen');
		expect(chen?.raterGroups.map((rater) => rater.label)).toEqual(['SSG Marisol Alvarez']);
		expect(chen?.raterGroups[0].lines.map((entry) => entry.id)).toEqual(['park', 'watanabe-late']);
		expect(chen?.lineCount).toBe(2);
		expect(chen?.inProgress).toBe(1);
	});

	it('orders senior raters by name with an unassigned group last', () => {
		const groups = groupRatingSchemeLines(lines, linePersonnel, 'seniorRaterAZ');
		expect(groups.map((group) => group.label)).toEqual(['1LT Wei Chen', 'LTC Holt', 'Not Set']);
	});

	it('puts the group holding the earliest open thru first when sorted by urgency, and marks external raters', () => {
		const groups = groupRatingSchemeLines(lines, linePersonnel, 'urgency');
		expect(groups.map((group) => group.label)).toEqual(['LTC Holt', '1LT Wei Chen', 'Not Set']);
		expect(groups[0].external).toBe(true);
		expect(groups[0].raterGroups[0].external).toBe(true);
	});

	it('groups an external senior rater and rater as one however the name is cased or spaced', () => {
		const external = (id: string, seniorRaterName: string, raterName: string) =>
			line(id, { raterPersonId: null, raterName, seniorRaterPersonId: null, seniorRaterName });

		const groups = groupRatingSchemeLines(
			[external('a', 'LTC Holt', 'Maj. Outside'), external('b', ' ltc holt ', 'maj. outside')],
			linePersonnel,
			'seniorRaterAZ'
		);

		expect(groups.map((group) => group.raterGroups.map((rater) => rater.lines.length))).toEqual([[2]]);
	});
});

describe('countChainRoles', () => {
	it('counts distinct senior raters and raters, treating an external name the same however it is cased', () => {
		expect(
			countChainRoles([
				line('a'),
				line('b', {
					raterPersonId: null,
					raterName: 'Maj. Outside',
					seniorRaterPersonId: null,
					seniorRaterName: 'LTC Holt'
				}),
				line('c', {
					raterPersonId: null,
					raterName: ' maj. outside ',
					seniorRaterPersonId: null,
					seniorRaterName: 'ltc holt'
				}),
				line('d', { raterPersonId: null, raterName: null, seniorRaterPersonId: null, seniorRaterName: null })
			])
		).toEqual({ seniorRaters: 2, raters: 2 });
	});
});
