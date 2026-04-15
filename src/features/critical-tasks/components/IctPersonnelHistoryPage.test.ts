// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import IctPersonnelHistoryPage from './IctPersonnelHistoryPage.svelte';
import type { CriticalTasksPersonnelHistoryData } from '$features/critical-tasks/criticalTasks.types';

const history: CriticalTasksPersonnelHistoryData = {
	personnel: {
		id: 'p-1',
		rank: 'SGT',
		firstName: 'Jane',
		lastName: 'Smith',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: null,
		groupName: ''
	},
	rows: [
		{
			completion: {
				id: 'completion-1',
				personnelId: 'p-1',
				ictTaskId: 'task-archived',
				completedAt: '2026-04-02',
				validationMethod: 'Practical Exercise',
				validatedBy: 'SFC Jones',
				notes: 'Lane validation',
				loggedBy: 'user-1',
				createdAt: '2026-04-02T12:00:00Z'
			},
			task: null,
			taskCode: '181-105-1002',
			taskTitle: 'Evacuate casualty',
			taskArchivedAt: '2026-04-14T12:00:00Z'
		}
	]
};

describe('IctPersonnelHistoryPage', () => {
	afterEach(cleanup);

	it('renders archived ICT task completions in the personnel history view', () => {
		render(IctPersonnelHistoryPage, {
			props: {
				data: {
					orgId: 'org-1',
					criticalTasksPersonnelHistory: history
				}
			}
		});

		expect(screen.getByText('SGT Smith, Jane')).toBeTruthy();
		expect(screen.getByText('181-105-1002')).toBeTruthy();
		expect(screen.getByText('Evacuate casualty')).toBeTruthy();
		expect(screen.getByText('Archived')).toBeTruthy();
		expect(screen.getByText('Lane validation')).toBeTruthy();
	});
});
