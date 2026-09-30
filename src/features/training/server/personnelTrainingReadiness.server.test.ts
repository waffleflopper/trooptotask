import { describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import { loadTrainingReadinessLane } from './personnelTrainingReadiness.server';

type ReadinessStore = Parameters<typeof loadTrainingReadinessLane>[0]['store'];

const person = {
	id: 'person-1',
	rank: 'SGT',
	mos: '68W',
	clinicRole: 'Medic'
} as Personnel;

function typeRow(id: string, name: string, sortOrder: number, extra: Record<string, unknown> = {}) {
	return {
		id,
		organization_id: 'org-1',
		name,
		sort_order: sortOrder,
		warning_days_yellow: 60,
		applies_to_roles: [],
		applies_to_mos: [],
		applies_to_ranks: [],
		excluded_roles: [],
		excluded_mos: [],
		excluded_ranks: [],
		can_be_exempted: false,
		exempt_personnel_ids: [],
		is_optional: false,
		...extra
	};
}

describe('Personnel Training readiness lane', () => {
	it('counts applicable overdue and soon-due requirements in catalog order', async () => {
		const findMany = vi.fn(async (table: string) => {
			if (table === 'training_types') {
				return [
					typeRow('cyber', 'Cyber Awareness', 2),
					typeRow('optional', 'Optional', 0, { is_optional: true }),
					typeRow('hipaa', 'HIPAA', 1)
				].sort((a, b) => a.sort_order - b.sort_order);
			}
			return [
				{ training_type_id: 'hipaa', expiration_date: '2026-05-10' },
				{ training_type_id: 'cyber', expiration_date: '2026-05-20' }
			];
		});

		const result = await loadTrainingReadinessLane({
			store: { findMany } as unknown as ReadinessStore,
			orgId: 'org-1',
			personnelId: person.id,
			asOf: '2026-05-14',
			loadAuthorizedPerson: async () => person
		});

		expect(result).toEqual({
			label: 'Training',
			value: '2 due',
			detail: 'HIPAA expired 4d ago. Cyber Awareness 6d left.',
			tone: 'bad'
		});
	});

	it('does not read Training data when Personnel or Group authorization fails', async () => {
		const findMany = vi.fn();
		const denial = Object.assign(new Error('out of scope'), { status: 403 });

		await expect(
			loadTrainingReadinessLane({
				store: { findMany } as unknown as ReadinessStore,
				orgId: 'org-1',
				personnelId: person.id,
				asOf: '2026-05-14',
				loadAuthorizedPerson: async () => {
					throw denial;
				}
			})
		).rejects.toBe(denial);
		expect(findMany).not.toHaveBeenCalled();
	});
});
