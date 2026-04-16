// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import IctReportsView from './IctReportsView.svelte';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';

const alpha: Group = { id: 'group-alpha', name: 'Alpha', sortOrder: 0 };
const bravo: Group = { id: 'group-bravo', name: 'Bravo', sortOrder: 1 };

const medic: Personnel = {
	id: 'person-medic',
	rank: 'SGT',
	lastName: 'Smith',
	firstName: 'Jane',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: alpha.id,
	groupName: alpha.name,
	archivedAt: null
};

const infantry: Personnel = {
	...medic,
	id: 'person-infantry',
	lastName: 'Jones',
	firstName: 'Alex',
	mos: '11B',
	clinicRole: 'Rifleman',
	groupId: bravo.id,
	groupName: bravo.name
};

const medicTask: IctTask = {
	id: 'task-medic',
	taskCode: '181-105-1001',
	title: 'TCCC lane',
	description: null,
	mos: ['68W'],
	expirationMonths: 12,
	sortOrder: 0,
	archivedAt: null,
	createdAt: '2026-04-01T00:00:00Z'
};

const commonTask: IctTask = {
	...medicTask,
	id: 'task-common',
	taskCode: '081-833-0010',
	title: 'Open airway',
	mos: []
};

function completion(overrides: Partial<PersonnelIctCompletion>): PersonnelIctCompletion {
	return {
		id: 'completion-1',
		personnelId: medic.id,
		ictTaskId: medicTask.id,
		completedAt: '2026-01-15',
		validationMethod: 'Demonstration',
		validatedBy: null,
		notes: null,
		loggedBy: 'user-1',
		createdAt: '2026-01-15T00:00:00Z',
		...overrides
	};
}

describe('IctReportsView', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders report summaries and updates the export context when filters change', async () => {
		render(IctReportsView, {
			props: {
				orgId: 'org-1',
				personnel: [medic, infantry],
				groups: [alpha, bravo],
				tasks: [medicTask, commonTask],
				completions: [
					completion({ personnelId: medic.id, ictTaskId: medicTask.id, completedAt: '2026-01-15' }),
					completion({
						id: 'completion-2',
						personnelId: medic.id,
						ictTaskId: commonTask.id,
						completedAt: '2025-12-20'
					}),
					completion({
						id: 'completion-3',
						personnelId: infantry.id,
						ictTaskId: commonTask.id,
						completedAt: '2024-01-01'
					})
				],
				settings: {
					defaultExpirationMonths: 12,
					expiringSoonWarningDays: 60
				},
				asOf: '2026-01-31'
			}
		});

		expect(screen.getByText('Critical Task Reports')).toBeTruthy();
		expect(screen.getByText('67%')).toBeTruthy();
		const bestCard = screen.getByText('Best Performing MOS').closest('section');
		const worstCard = screen.getByText('Worst Performing MOS').closest('section');
		const trendPanel = screen.getByText('Completion Trend').closest('section');
		expect(bestCard).toBeTruthy();
		expect(worstCard).toBeTruthy();
		expect(trendPanel).toBeTruthy();
		expect(within(bestCard!).getByText('68W')).toBeTruthy();
		expect(within(worstCard!).getByText('11B')).toBeTruthy();
		expect(within(trendPanel!).getByText('2026-01')).toBeTruthy();

		const exportLink = screen.getByRole('link', { name: 'Export CSV' });
		expect(exportLink.getAttribute('href')).toBe('/org/org-1/api/critical-tasks/reports/export');

		const groupFilter = screen.getByLabelText('Filter by group') as HTMLSelectElement;
		groupFilter.value = alpha.id;
		await fireEvent.change(groupFilter);

		await waitFor(() => {
			expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe(
				`/org/org-1/api/critical-tasks/reports/export?groupId=${alpha.id}`
			);
		});
	});
});
