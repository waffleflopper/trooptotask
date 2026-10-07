import { describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { SavedTrainingType } from '../contracts';
import { loadTrainingReadinessLane } from './personnelTrainingReadiness.server';

const person = { id: 'person-1', rank: 'SGT', mos: '68W', clinicRole: 'Medic' } as Personnel;
function type(id: string, name: string, isOptional = false): SavedTrainingType {
	return {
		id,
		name,
		organization_id: 'org-1',
		created_at: '2026-01-01',
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		exemptPersonnelIds: [],
		canBeExempted: false,
		expirationDateOnly: false,
		isOptional,
		color: '#000000',
		sortOrder: 0
	};
}

describe('Personnel Training readiness lane', () => {
	it('counts applicable overdue and soon-due requirements in catalog order', async () => {
		const result = await loadTrainingReadinessLane({
			trainingCatalog: {
				listTypes: async () => [
					type('optional', 'Optional', true),
					type('hipaa', 'HIPAA'),
					type('cyber', 'Cyber Awareness')
				]
			},
			trainingCompletions: {
				listPersonReadinessFacts: async () => [
					{ trainingTypeId: 'hipaa', expirationDate: '2026-05-10' },
					{ trainingTypeId: 'cyber', expirationDate: '2026-05-20' }
				]
			},
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
	it('awaits Personnel and Group admission before reading either Training source', async () => {
		const listTypes = vi.fn(async () => [type('never', 'Never')]);
		const listPersonReadinessFacts = vi.fn(async () => [{ trainingTypeId: 'never', expirationDate: null }]);
		const denial = Object.assign(new Error('out of scope'), { status: 403 });
		const input = {
			trainingCatalog: { listTypes },
			trainingCompletions: { listPersonReadinessFacts },
			personnelId: person.id,
			asOf: '2026-05-14'
		};
		await expect(
			loadTrainingReadinessLane({
				...input,
				loadAuthorizedPerson: async () => {
					throw denial;
				}
			})
		).rejects.toBe(denial);
		expect(listTypes).not.toHaveBeenCalled();
		expect(listPersonReadinessFacts).not.toHaveBeenCalled();
		expect(await loadTrainingReadinessLane({ ...input, loadAuthorizedPerson: async () => person })).toEqual({
			label: 'Training',
			value: 'Current',
			detail: 'No due or overdue Training requirements.',
			tone: 'good'
		});
	});
});
