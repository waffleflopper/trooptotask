import { describe, expect, it } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { IctTask, PersonnelIctCompletion } from '../criticalTasks.types';
import { describeCriticalTaskItem } from '../utils/personnelCriticalTaskItems';
import { loadPersonnelCriticalTaskReadiness } from './personnelCriticalTaskItems.server';

const person = { id: 'okafor', mos: '68W' } as Personnel;

function task(id: string, taskCode: string, overrides: Partial<IctTask> = {}): IctTask {
	return {
		id,
		taskCode,
		title: `Task ${taskCode}`,
		description: null,
		mos: ['68W'],
		expirationMonths: null,
		sortOrder: 0,
		archivedAt: null,
		createdAt: '2026-01-01T00:00:00Z',
		...overrides
	};
}

function validation(id: string, ictTaskId: string, completedAt: string): PersonnelIctCompletion {
	return {
		id,
		personnelId: person.id,
		ictTaskId,
		completedAt,
		validationMethod: 'Demonstration',
		validatedBy: 'SSG Alvarez',
		notes: null,
		loggedBy: null,
		createdAt: `${completedAt}T12:00:00Z`
	};
}

describe('loadPersonnelCriticalTaskReadiness', () => {
	it('ranks applicable tasks by their latest validation and keeps each task history newest first', async () => {
		const readiness = await loadPersonnelCriticalTaskReadiness({
			organizationSettings: {
				findCriticalTasksDefaults: async () => ({ defaultExpirationMonths: 12, expiringSoonWarningDays: 30 })
			},
			criticalTaskLibrary: {
				listCatalog: async () => [
					task('airway', '081-833-0210'),
					task('tourniquet', '081-833-0302', { expirationMonths: 24 }),
					task('splint', '081-833-0400'),
					task('radio', '113-587-2070', { mos: ['25U'] }),
					task('retired', '081-000-0001', { archivedAt: '2026-01-01T00:00:00Z' })
				]
			},
			criticalTaskCompletions: {
				listReadinessHistory: async () => [
					validation('airway-old', 'airway', '2025-10-20'),
					validation('tourniquet-1', 'tourniquet', '2025-06-01'),
					validation('airway-new', 'airway', '2025-10-25'),
					validation('splint-1', 'splint', '2024-01-01')
				]
			},
			orgId: 'org-1',
			asOf: '2026-10-06',
			loadAuthorizedPerson: async () => person
		});

		expect(readiness.items.map((item) => [item.taskId, item.status, item.expirationDate, item.cycleMonths])).toEqual([
			['splint', 'expired', '2025-01-01', 12],
			['airway', 'expiring', '2026-10-25', 12],
			['tourniquet', 'current', '2027-06-01', 24]
		]);
		expect(readiness.items[1].history.map((entry) => entry.id)).toEqual(['airway-new', 'airway-old']);
		expect(readiness.items[1].latest?.id).toBe('airway-new');
		expect(describeCriticalTaskItem(readiness.items[1])).toBe('081-833-0210 · Demonstration by SSG Alvarez');
		expect(readiness.expiringSoonWarningDays).toBe(30);
	});

	it('lists an applicable task without a validation as missing', async () => {
		const readiness = await loadPersonnelCriticalTaskReadiness({
			organizationSettings: { findCriticalTasksDefaults: async () => null },
			criticalTaskLibrary: { listCatalog: async () => [task('airway', '081-833-0210')] },
			criticalTaskCompletions: { listReadinessHistory: async () => [] },
			orgId: 'org-1',
			asOf: '2026-10-06',
			loadAuthorizedPerson: async () => person
		});

		expect(readiness.items.map((item) => [item.taskCode, item.status, item.latest, item.history])).toEqual([
			['081-833-0210', 'missing', null, []]
		]);
		expect(describeCriticalTaskItem(readiness.items[0])).toBe('081-833-0210 · not recorded');
	});
});
