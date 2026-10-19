import { describe, expect, it } from 'vitest';
import { alsoChecked, attentionRows, uncheckedSources } from './personnelAttentionView';
import type { PersonnelAttention } from './personnelReadiness.types';

const paths = { person: '/org/o/personnel/sgt-okafor', org: '/org/o' };

const attention: PersonnelAttention = {
	items: [
		{
			kind: 'training',
			status: 'missing',
			id: 'sharp',
			title: 'SHARP annual training',
			detail: 'Required for 68W · no completion on record',
			dueDate: null,
			daysUntilDue: null,
			target: { tab: 'readiness', item: { kind: 'training', id: 'sharp' } }
		},
		{
			kind: 'loss',
			status: 'upcoming',
			id: 'ETS',
			title: 'ETS 14 Mar 2027',
			detail: 'Inside the 180-day loss window',
			dueDate: '2027-03-14',
			daysUntilDue: 159,
			target: { tab: 'data-sheet' }
		}
	],
	readinessBadge: { count: 1, complete: false },
	checked: {
		training: { state: 'checked', currentCount: 15 },
		criticalTasks: { state: 'failed' },
		evaluation: { state: 'checked' },
		loss: { state: 'checked' },
		onboarding: { state: 'checked', status: 'complete' }
	},
	failed: ['criticalTasks']
};

describe('Overview attention', () => {
	it('links each item to the place a leader fixes it, in ranked order', () => {
		const rows = attentionRows(attention, paths);

		expect(rows.map((row) => [row.id, row.status, row.title, row.href])).toEqual([
			[
				'training:sharp',
				'missing',
				'SHARP annual training',
				'/org/o/personnel/sgt-okafor/readiness?item=training%3Asharp'
			],
			['loss:ETS', 'upcoming', 'ETS 14 Mar 2027', '/org/o/personnel/sgt-okafor/data-sheet']
		]);
	});

	it('times a dated item by its day count and does not invent a date for a missing one', () => {
		const [missing, upcoming] = attentionRows(attention, paths);

		expect(missing.timing).toBe('Not recorded');
		expect(upcoming.timing).toContain('159');
	});

	it('names a failed source instead of counting it as checked', () => {
		expect(uncheckedSources(attention)).toEqual(['critical tasks']);
		const reassurance = alsoChecked(attention.checked);
		expect(reassurance).toHaveLength(2);
		expect(reassurance[0]).toContain('15');
		expect(reassurance.join(' ')).not.toMatch(/critical/i);
	});

	it('leaves a source with nothing current out of the reassurance line', () => {
		expect(
			alsoChecked({
				...attention.checked,
				training: { state: 'checked', currentCount: 0 },
				criticalTasks: { state: 'checked', currentCount: 0, applicableCount: 1 },
				onboarding: { state: 'checked', status: 'none' }
			})
		).toEqual([]);
	});
});
