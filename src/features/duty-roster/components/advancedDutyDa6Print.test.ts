// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { printAdvancedDutyDa6Matrices } from './advancedDutyDa6Print';
import type { AdvancedDutyDa6Matrix } from '../duty-roster.types';

function makeMatrix(): AdvancedDutyDa6Matrix {
	return {
		templateSlotId: 'slot-1',
		roleLabel: 'Staff <img src=x onerror=alert(1)>',
		rotationPoolKey: 'primary & secondary',
		sequenceKey: 'single',
		sequenceLabel: 'Single "DA6"',
		numberingMode: 'single-sequence',
		columns: [
			{
				eventDate: '2026-05-01',
				coverageStart: '2026-05-01T17:00:00',
				coverageEnd: '2026-05-02T09:00:00',
				sequenceKey: 'single',
				sequenceLabel: 'Single "DA6"',
				chargeSequenceStart: 1,
				chargeableCount: 1
			}
		],
		rows: [
			{
				personnelId: 'person-1',
				display: {
					id: 'person-1',
					rank: 'SGT',
					firstName: '<script>alert(1)</script>',
					lastName: 'Nolan & Sons',
					groupName: 'Alpha'
				},
				cells: [
					{
						eventDate: '2026-05-01',
						personnelId: 'person-1',
						code: 'available-not-selected',
						da6Code: null,
						chargeable: true,
						queuePosition: 1,
						sequenceNumber: 1,
						assigned: false,
						reason: null,
						reasonCode: null
					}
				]
			}
		]
	};
}

describe('printAdvancedDutyDa6Matrices', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('escapes dynamic DA6 print values before writing markup', () => {
		const write = vi.fn();
		const printWindow = {
			document: {
				open: vi.fn(),
				write,
				close: vi.fn()
			},
			focus: vi.fn(),
			print: vi.fn()
		} as unknown as Window;
		vi.spyOn(window, 'open').mockReturnValue(printWindow);

		printAdvancedDutyDa6Matrices('DA6 <img src=x onerror=alert(1)>', [makeMatrix()]);

		const markup = String(write.mock.calls[0]?.[0] ?? '');
		expect(markup).toContain('DA6 &lt;img src=x onerror=alert(1)&gt;');
		expect(markup).toContain('Staff &lt;img src=x onerror=alert(1)&gt;');
		expect(markup).toContain('primary &amp; secondary');
		expect(markup).toContain('Single &quot;DA6&quot;');
		expect(markup).toContain('Nolan &amp; Sons, &lt;script&gt;alert(1)&lt;/script&gt;');
		expect(markup).not.toContain('<img src=x onerror=alert(1)>');
		expect(markup).not.toContain('<script>alert(1)</script>');
	});
});
