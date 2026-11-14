import { describe, expect, it } from 'vitest';
import { linePersonnel, line } from './ratingSchemeLineTestData';
import { chainNames, joinNames, spokenPersonLabel } from './personLabel';

describe('personLabel', () => {
	it('names a Soldier as a sentence would', () => {
		expect(spokenPersonLabel(linePersonnel[1])).toBe('SSG Marisol Alvarez');
	});

	it('lists a chain in rating order and leaves empty roles out', () => {
		const chain = line('a', { intermediateRaterName: 'Outside IR', reviewerPersonId: 'reyes' });
		expect(chainNames(chain, linePersonnel)).toEqual([
			'SSG Marisol Alvarez',
			'Outside IR',
			'1LT Wei Chen',
			'CPT Ana Reyes'
		]);
		expect(chainNames(line('b'), linePersonnel)).toEqual(['SSG Marisol Alvarez', '1LT Wei Chen']);
	});

	it('joins names with commas and a final and', () => {
		expect(joinNames([])).toBe('');
		expect(joinNames(['A'])).toBe('A');
		expect(joinNames(['A', 'B'])).toBe('A and B');
		expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
	});
});
