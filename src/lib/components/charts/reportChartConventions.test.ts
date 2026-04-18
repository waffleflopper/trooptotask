import { describe, expect, it } from 'vitest';
import { buildReportCountTicks, readinessTrendDomain } from './reportChartConventions';

describe('report chart conventions', () => {
	it('keeps the readiness trend in the operating range until visible data drops below 50%', () => {
		expect(readinessTrendDomain([50, 72, 100])).toEqual([50, 100]);
		expect(readinessTrendDomain([48, 72, 100])).toEqual([0, 100]);
		expect(readinessTrendDomain([])).toBeNull();
	});

	it('builds compact count-axis ticks that always include the visible maximum', () => {
		expect(buildReportCountTicks(4, { denseMax: 4 })).toEqual([0, 1, 2, 3, 4]);
		expect(buildReportCountTicks(7, { denseMax: 4 })).toEqual([0, 2, 4, 6, 7]);
		expect(buildReportCountTicks(8, { denseMax: 5 })).toEqual([0, 2, 4, 6, 8]);
	});
});
