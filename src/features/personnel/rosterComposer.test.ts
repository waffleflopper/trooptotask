import { describe, expect, it } from 'vitest';
import { alreadyOpenOf, dueChipLabel, dueDatePresets, selectedPreset } from './rosterComposer';
import type { Known, OpenFollowUpSignal, SignalRow } from './rosterSignals';

function dates(today: string): string[] {
	return dueDatePresets(today).map((preset) => preset.date);
}

describe('dueDatePresets', () => {
	it('offers tomorrow, the coming Friday and a week out from a Tuesday', () => {
		expect(dates('2026-10-06')).toEqual(['2026-10-07', '2026-10-09', '2026-10-13']);
	});

	it('moves to next week’s Friday when today is Friday', () => {
		expect(dates('2026-10-09')).toEqual(['2026-10-10', '2026-10-16', '2026-10-16']);
	});

	it('finds Friday from a Saturday and across a month end', () => {
		expect(dates('2026-10-10')).toEqual(['2026-10-11', '2026-10-16', '2026-10-17']);
		expect(dates('2026-10-30')).toEqual(['2026-10-31', '2026-11-06', '2026-11-06']);
	});

	it('labels the chips and lets a Friday that is also tomorrow select only the first', () => {
		const thursday = dueDatePresets('2026-10-08');
		expect(thursday.map(dueChipLabel)).toEqual(['Tomorrow', 'Fri 9 Oct', '+1 week']);
		expect(selectedPreset(thursday, '2026-10-09')).toBe('tomorrow');
		expect(selectedPreset(thursday, '2026-10-15')).toBe('week');
		expect(selectedPreset(thursday, '2026-10-12')).toBeNull();
		expect(selectedPreset(thursday, null)).toBeNull();
	});
});

describe('alreadyOpenOf', () => {
	const today = '2026-10-06';

	function ready(openFollowUps: Known<OpenFollowUpSignal>): SignalRow {
		return {
			kind: 'ready',
			value: {
				personnelId: 'p1',
				today: { kind: 'withheld' },
				attention: { kind: 'withheld' },
				matches: {},
				openFollowUps,
				loss: null
			}
		};
	}

	it('names the first open follow-up with its due date and how many more', () => {
		const row = ready({
			kind: 'known',
			value: { count: 3, first: { id: 'f1', title: 'Turn in TA-50 shortage list', dueDate: '2026-10-09' } }
		});
		expect(alreadyOpenOf(row, today)).toEqual({
			kind: 'open',
			title: 'Turn in TA-50 shortage list',
			due: 'due Fri 9 Oct',
			overdue: false,
			more: 2
		});
	});

	it('marks an overdue follow-up and words a missing date', () => {
		const overdue = ready({
			kind: 'known',
			value: { count: 1, first: { id: 'f1', title: 'Sign DA 31', dueDate: '2026-10-05' } }
		});
		expect(alreadyOpenOf(overdue, today)).toMatchObject({ due: 'due Mon 5 Oct', overdue: true, more: 0 });
		const undated = ready({
			kind: 'known',
			value: { count: 1, first: { id: 'f2', title: 'Call about leave', dueDate: null } }
		});
		expect(alreadyOpenOf(undated, today)).toMatchObject({ due: 'no due date', overdue: false });
	});

	it('is omitted with none open or a withheld source, and a skeleton while the lane is pending', () => {
		expect(alreadyOpenOf(ready({ kind: 'known', value: { count: 0, first: null } }), today)).toEqual({ kind: 'none' });
		expect(alreadyOpenOf(ready({ kind: 'withheld' }), today)).toEqual({ kind: 'none' });
		expect(alreadyOpenOf({ kind: 'failed' }, today)).toEqual({ kind: 'none' });
		expect(alreadyOpenOf({ kind: 'pending' }, today)).toEqual({ kind: 'pending' });
	});
});
