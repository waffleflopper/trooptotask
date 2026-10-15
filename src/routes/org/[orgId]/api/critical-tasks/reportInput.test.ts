import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	parseCriticalTasksMatrixExportInput,
	parseCriticalTasksReportInput,
	toCriticalTasksMatrixExportInput,
	toCriticalTasksReportInput
} from './reportInput';

function event(query: string, timeZone?: string) {
	return {
		url: new URL(`https://trooptotask.test/reports?${query}`),
		cookies: { get: (name: string) => (name === 't2t_tz' ? timeZone : undefined) }
	} as never;
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-15T02:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('critical task report input parsing', () => {
	it('parses repeated and comma-separated MOS filters into a shared multi-select filter', () => {
		const parsed = parseCriticalTasksReportInput(event('groupId=alpha&mos=68W&mos=11B,18D&rank=SGT&role=Medic'));

		expect(parsed).toEqual({
			groupId: 'alpha',
			mos: ['68W', '11B', '18D'],
			role: 'Medic',
			rank: 'SGT',
			asOf: '2026-10-15'
		});
		expect(toCriticalTasksReportInput(parsed).filters?.mos).toEqual(['68W', '11B', '18D']);
	});

	it('preserves synthetic roster group filters for matrix exports', () => {
		const parsed = parseCriticalTasksMatrixExportInput(event('groupFilter=name%3AUnassigned&gapsOnly=1'));

		expect(toCriticalTasksMatrixExportInput(parsed)).toEqual({
			selectedGroupId: undefined,
			selectedGroupFilter: 'name:Unassigned',
			gapsOnly: true,
			search: undefined,
			asOf: '2026-10-15'
		});
	});

	it('evaluates reports and matrix exports on the viewer day from the time zone cookie', () => {
		const report = toCriticalTasksReportInput(parseCriticalTasksReportInput(event('', 'America/Los_Angeles')));
		const matrix = toCriticalTasksMatrixExportInput(
			parseCriticalTasksMatrixExportInput(event('', 'America/Los_Angeles'))
		);

		expect([report.asOf, matrix.asOf]).toEqual(['2026-10-14', '2026-10-14']);
	});
});
