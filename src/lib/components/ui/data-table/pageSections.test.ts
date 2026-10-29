import { describe, expect, it } from 'vitest';
import { pageSections, type PageableSection } from './pageSections';

const section = (key: string, rows: number, parentKey: string | null = null, collapsed = false) => ({
	key,
	parentKey,
	collapsed,
	rows: Array.from({ length: rows }, (_, index) => `${key}${index + 1}`)
});
const view = (sections: PageableSection<string>[], size: number, page: number) => {
	const result = pageSections<string, PageableSection<string>>(sections, size, page);
	return { totalPages: result.totalPages, page: result.sections.map((s) => [s.key, s.rows.join(' ')]) };
};

describe('pageSections', () => {
	it('splits a section across pages and leads a page that starts inside a sub-group with the Groups above it', () => {
		const tree = [section('plt', 1), section('sq', 2, 'plt'), section('team', 3, 'sq'), section('', 1)];

		expect(view(tree, 4, 1)).toEqual({
			totalPages: 2,
			page: [
				['plt', 'plt1'],
				['sq', 'sq1 sq2'],
				['team', 'team1']
			]
		});
		expect(view(tree, 4, 2).page).toEqual([
			['plt', ''],
			['sq', ''],
			['team', 'team2 team3'],
			['', '1']
		]);
	});

	it('puts a collapsed section on the page where its rows would start and counts none of them', () => {
		const tree = [section('a', 2), section('b', 5, null, true), section('c', 2)];

		expect(view(tree, 2, 1).page).toEqual([['a', 'a1 a2']]);
		expect(view(tree, 2, 2)).toEqual({
			totalPages: 2,
			page: [
				['b', 'b1 b2 b3 b4 b5'],
				['c', 'c1 c2']
			]
		});
	});

	it('keeps the headers of an all-collapsed roster on its only page and clamps a page past the end', () => {
		const tree = [section('a', 2, null, true), section('b', 2, null, true)];

		expect(view(tree, 2, 3)).toEqual({
			totalPages: 1,
			page: [
				['a', 'a1 a2'],
				['b', 'b1 b2']
			]
		});
	});

	it('never treats Unassigned as a parent', () => {
		const tree = [section('', 3), section('top', 2)];

		expect(view(tree, 3, 2).page).toEqual([['top', 'top1 top2']]);
	});
});
