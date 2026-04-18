import { describe, expect, it } from 'vitest';
import { parseCriticalTasksReportInput, toCriticalTasksReportInput } from './reportInput';

describe('critical task report input parsing', () => {
	it('parses repeated and comma-separated MOS filters into a shared multi-select filter', () => {
		const url = new URL('https://trooptotask.test/reports?groupId=alpha&mos=68W&mos=11B,18D&rank=SGT&role=Medic');

		const parsed = parseCriticalTasksReportInput(url);

		expect(parsed).toEqual({
			groupId: 'alpha',
			mos: ['68W', '11B', '18D'],
			role: 'Medic',
			rank: 'SGT'
		});
		expect(toCriticalTasksReportInput(parsed).filters?.mos).toEqual(['68W', '11B', '18D']);
	});
});
