import { describe, expect, it } from 'vitest';
import { evaluation, line, linePersonnel } from './ratingSchemeLineTestData';
import { buildRatingSchemeLinesWorkbook } from './ratingSchemeLinesExport';

describe('buildRatingSchemeLinesWorkbook', () => {
	it('publishes the chain on each line and nothing of an open Evaluation', async () => {
		const workbook = await buildRatingSchemeLinesWorkbook(
			[
				line('a', { open: evaluation('e', 'a', { workflowStatus: 'with-senior-rater' }), notes: 'PCS in March' }),
				line('b', { ratedPersonId: 'park', archivedAt: '2026-02-01T00:00:00Z' })
			],
			linePersonnel
		);
		const sheet = workbook.getWorksheet('Rating Scheme');
		const header = (sheet?.getRow(1).values as unknown[]).filter(Boolean).map(String);
		expect(header.some((name) => /workflow|due|thru|status|period/i.test(name))).toBe(false);
		const first = sheet?.getRow(2);
		expect(first?.getCell('A').value).toBe('SGT Watanabe, Kenji');
		expect(first?.getCell('D').value).toBe('SSG Alvarez, Marisol');
		expect(first?.getCell('F').value).toBe('1LT Chen, Wei');
		expect(first?.getCell('H').value).toBe('Listed');
		expect(first?.getCell('I').value).toBe('PCS in March');
		expect(sheet?.getRow(3).getCell('H').value).toBe('Archived');
	});
});
