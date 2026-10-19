import { describe, expect, it } from 'vitest';
import { buildPersonnelAttention } from './personnelAttention';
import type { AttentionInput } from './personnelReadiness.types';

const sources: AttentionInput = {
	training: {
		ok: true,
		value: {
			items: [
				{
					typeId: 'cpr',
					name: 'CPR / BLS',
					status: 'expired',
					daysUntilExpiration: -12,
					cycleMonths: 24,
					completion: { expirationDate: '2026-09-24' }
				},
				{
					typeId: 'sharp',
					name: 'SHARP',
					status: 'expiring',
					daysUntilExpiration: 21,
					cycleMonths: 12,
					completion: { expirationDate: '2026-10-27' }
				},
				{
					typeId: 'hipaa',
					name: 'HIPAA',
					status: 'current',
					daysUntilExpiration: 200,
					cycleMonths: 12,
					completion: { expirationDate: '2027-04-24' }
				}
			]
		}
	},
	criticalTasks: {
		ok: true,
		value: {
			items: [
				{
					taskId: 'airway',
					taskCode: '081-833-0210',
					name: 'Insert a nasopharyngeal airway',
					status: 'missing',
					daysUntilExpiration: null,
					expirationDate: null
				},
				{
					taskId: 'tourniquet',
					taskCode: '081-833-0302',
					name: 'Apply a tourniquet',
					status: 'current',
					daysUntilExpiration: 300,
					expirationDate: '2027-08-14'
				}
			]
		}
	},
	evaluation: {
		ok: true,
		value: {
			entryId: 'eval-1',
			evalType: 'NCOER',
			reportTypeLabel: 'Annual',
			periodEnd: '2026-11-30',
			daysUntilThru: 55,
			dueStatus: 'due-60',
			phase: { label: 'Drafting' }
		}
	},
	loss: {
		ok: true,
		value: {
			windowDays: 180,
			ets: { date: '2027-03-14', daysRemaining: 159 },
			deros: null,
			inWindow: { trigger: 'ETS', date: '2027-03-14', daysRemaining: 159, enteredOn: '2026-09-15' }
		}
	},
	onboarding: { ok: true, value: { state: 'complete' } }
};

describe('buildPersonnelAttention', () => {
	it('ranks every problem across sources most urgent first and counts the Readiness badge', () => {
		const attention = buildPersonnelAttention(sources);

		expect(attention.items.map((item) => [item.kind, item.status, item.title, item.daysUntilDue])).toEqual([
			['training', 'expired', 'CPR / BLS', -12],
			['critical-task', 'missing', 'Insert a nasopharyngeal airway', null],
			['training', 'expiring', 'SHARP', 21],
			['evaluation', 'due', 'Annual NCOER', 55],
			['loss', 'upcoming', 'ETS', 159]
		]);
		expect(attention.items[0]).toEqual({
			kind: 'training',
			status: 'expired',
			id: 'cpr',
			title: 'CPR / BLS',
			detail: '24-month cycle',
			dueDate: '2026-09-24',
			daysUntilDue: -12,
			target: { tab: 'readiness', item: { kind: 'training', id: 'cpr' } }
		});
		expect(attention.readinessBadge).toEqual({ count: 3, complete: true });
		expect(attention.checked).toEqual({
			training: { state: 'checked', currentCount: 1 },
			criticalTasks: { state: 'checked', currentCount: 1, applicableCount: 2 },
			evaluation: { state: 'checked' },
			loss: { state: 'checked' },
			onboarding: { state: 'checked', status: 'complete' }
		});
		expect(attention.failed).toEqual([]);
	});

	it('leaves an evaluation outside 60 days and a loss outside the window off the list', () => {
		const attention = buildPersonnelAttention({
			...sources,
			evaluation: {
				ok: true,
				value: {
					entryId: 'eval-1',
					evalType: 'NCOER',
					reportTypeLabel: 'Annual',
					periodEnd: '2027-03-01',
					daysUntilThru: 136,
					dueStatus: 'current',
					phase: { label: 'Drafting' }
				}
			},
			loss: {
				ok: true,
				value: { windowDays: 180, ets: { date: '2028-01-01', daysRemaining: 450 }, deros: null, inWindow: null }
			}
		});

		expect(attention.items.map((item) => item.kind)).toEqual(['training', 'critical-task', 'training']);
	});

	it('reports failed sources instead of reading them as clear', () => {
		const attention = buildPersonnelAttention({
			...sources,
			criticalTasks: { ok: false },
			onboarding: { ok: false }
		});

		expect(attention.items.map((item) => item.title)).toEqual(['CPR / BLS', 'SHARP', 'Annual NCOER', 'ETS']);
		expect(attention.readinessBadge).toEqual({ count: 2, complete: false });
		expect(attention.checked.criticalTasks).toEqual({ state: 'failed' });
		expect(attention.checked.onboarding).toEqual({ state: 'failed' });
		expect(attention.failed).toEqual(['criticalTasks', 'onboarding']);
	});
});
