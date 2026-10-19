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
	it('turns each item into a linked row with its category and timing', () => {
		expect(attentionRows(attention, paths)).toEqual([
			{
				id: 'training:sharp',
				status: 'missing',
				title: 'SHARP annual training',
				detail: 'Required for 68W · no completion on record',
				category: 'Training',
				timing: 'Not recorded',
				href: '/org/o/personnel/sgt-okafor/readiness?item=training%3Asharp'
			},
			{
				id: 'loss:ETS',
				status: 'upcoming',
				title: 'ETS 14 Mar 2027',
				detail: 'Inside the 180-day loss window',
				category: 'Loss',
				timing: 'in 159 days',
				href: '/org/o/personnel/sgt-okafor/data-sheet'
			}
		]);
	});

	it('names a failed source instead of counting it as checked', () => {
		expect(uncheckedSources(attention)).toEqual(['critical tasks']);
		expect(alsoChecked(attention.checked)).toEqual(['15 training items current', 'onboarding complete']);
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

	it('counts a single current training item in the singular', () => {
		expect(alsoChecked({ ...attention.checked, training: { state: 'checked', currentCount: 1 } })).toContain(
			'1 training item current'
		);
	});
});
