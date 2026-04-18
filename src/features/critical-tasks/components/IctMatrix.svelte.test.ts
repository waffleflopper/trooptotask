// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import IctMatrix from './IctMatrix.svelte';
import type {
	CriticalTasksSettings,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';

function person(overrides: Partial<Personnel>): Personnel {
	return {
		id: 'person-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'Jane',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'group-alpha',
		groupName: 'Alpha',
		...overrides
	};
}

function task(overrides: Partial<IctTask>): IctTask {
	return {
		id: 'task-1',
		taskCode: '181-105-1001',
		title: 'Perform tactical combat casualty care',
		description: null,
		mos: [],
		expirationMonths: null,
		sortOrder: 0,
		archivedAt: null,
		createdAt: '2026-04-01T12:00:00Z',
		...overrides
	};
}

function completion(overrides: Partial<PersonnelIctCompletion>): PersonnelIctCompletion {
	return {
		id: 'completion-1',
		personnelId: 'smith',
		ictTaskId: 'task-1',
		completedAt: '2026-04-01',
		validationMethod: 'Demonstration',
		validatedBy: 'SFC Observer',
		notes: null,
		loggedBy: 'user-1',
		createdAt: '2026-04-01T12:00:00Z',
		...overrides
	};
}

const settings: CriticalTasksSettings = {
	defaultExpirationMonths: 12,
	expiringSoonWarningDays: 60
};

const groups: Group[] = [{ id: 'group-alpha', name: 'Alpha', sortOrder: 0 }];

afterEach(() => {
	cleanup();
});

describe('IctMatrix', () => {
	it('renders applicable status cells with keyboard-focusable completion details and neutral non-applicable cells', () => {
		render(IctMatrix, {
			props: {
				orgId: 'org-1',
				personnel: [person({ id: 'smith' })],
				tasks: [
					task({ id: 'tccc', taskCode: '181-105-1001', title: 'TCCC', mos: ['68W'], sortOrder: 0 }),
					task({ id: 'expiring', taskCode: '181-105-1002', title: 'Expiring task', mos: ['68W'], sortOrder: 1 }),
					task({ id: 'expired', taskCode: '181-105-1003', title: 'Expired task', mos: ['68W'], sortOrder: 2 }),
					task({ id: 'infantry', taskCode: '071-326-0501', title: 'Infantry task', mos: ['11B'], sortOrder: 3 }),
					task({ id: 'universal', taskCode: '999-000-0001', title: 'Universal task', mos: [], sortOrder: 4 })
				],
				completions: [
					completion({
						id: 'tccc-completion',
						personnelId: 'smith',
						ictTaskId: 'tccc',
						completedAt: '2026-04-01',
						validatedBy: 'SFC Observer'
					}),
					completion({
						id: 'expiring-completion',
						personnelId: 'smith',
						ictTaskId: 'expiring',
						completedAt: '2025-05-01'
					}),
					completion({
						id: 'expired-completion',
						personnelId: 'smith',
						ictTaskId: 'expired',
						completedAt: '2025-04-01'
					})
				],
				groups,
				settings,
				asOf: '2026-04-15',
				orgName: 'Test Unit'
			}
		});

		expect(screen.getByRole('table', { name: 'Critical Tasks readiness matrix' })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: /181-105-1001 TCCC/ })).toBeTruthy();
		const personLink = screen.getByRole('link', { name: /Smith, Jane/ });
		expect(personLink.getAttribute('href')).toBe('/org/org-1/critical-tasks/smith');
		expect(personLink.textContent).toContain('SGT');
		expect(personLink.textContent).toContain('Smith, Jane');
		expect(personLink.textContent).toContain('68W');
		expect(screen.getByLabelText('Smith, Jane readiness 50%')).toBeTruthy();
		expect(screen.getByText(/Alpha/)).toBeTruthy();
		expect(screen.getByText('1 personnel (50% Readiness)')).toBeTruthy();
		expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
		expect(screen.getByText('Not Required for MOS')).toBeTruthy();

		const currentCell = screen.getByRole('button', {
			name: /Smith 181-105-1001: current. TCCC: current. Completed 2026-04-01. Expires 2027-04-01./
		});
		expect(currentCell.getAttribute('data-status')).toBe('current');
		currentCell.focus();
		expect(document.activeElement).toBe(currentCell);
		expect(screen.getByText('Completed 2026-04-01')).toBeTruthy();
		expect(screen.getByText('Expires 2027-04-01')).toBeTruthy();
		expect(screen.getAllByText('SFC Observer').length).toBeGreaterThan(0);

		const expiringCell = screen.getByRole('button', {
			name: /Smith 181-105-1002: expiring soon. Expiring task: expiring soon./
		});
		expect(expiringCell.getAttribute('data-status')).toBe('expiring-soon');
		expect(expiringCell.textContent).toContain('!');

		const expiredCell = screen.getByRole('button', {
			name: /Smith 181-105-1003: expired. Expired task: expired./
		});
		expect(expiredCell.getAttribute('data-status')).toBe('expired');
		expect(expiredCell.textContent).toContain('✗');

		expect(screen.queryByRole('button', { name: /Smith 071-326-0501/ })).toBeNull();
		expect(screen.getByLabelText('Smith 071-326-0501: not applicable')).toBeTruthy();

		const missingCell = screen.getByRole('button', { name: /Smith 999-000-0001: not recorded/ });
		expect(missingCell.getAttribute('data-status')).toBe('not-recorded');
	});

	it('wraps dense matrices in a horizontal scroll container for large personnel and task counts', () => {
		const densePersonnel = Array.from({ length: 24 }, (_, index) =>
			person({
				id: `person-${index + 1}`,
				lastName: `Soldier-${String(index + 1).padStart(2, '0')}`,
				firstName: 'Jordan',
				groupId: 'group-alpha',
				groupName: 'Alpha'
			})
		);
		const denseTasks = Array.from({ length: 18 }, (_, index) =>
			task({
				id: `task-${index + 1}`,
				taskCode: `181-105-${String(index + 1).padStart(4, '0')}`,
				title: `Task ${index + 1}`,
				sortOrder: index,
				mos: []
			})
		);

		const { container } = render(IctMatrix, {
			props: {
				orgId: 'org-1',
				personnel: densePersonnel,
				tasks: denseTasks,
				completions: [],
				groups,
				settings,
				orgName: 'Test Unit'
			}
		});

		const scrollContainer = screen.getByTestId('critical-tasks-matrix-scroll');
		const table = screen.getByTestId('critical-tasks-matrix-table');
		const rowgroups = within(table).getAllByRole('rowgroup');
		const bodyRows = within(rowgroups[1]!).getAllByRole('row');

		expect(scrollContainer).toBeTruthy();
		expect(table).toBeTruthy();
		expect(within(table).getAllByRole('columnheader')).toHaveLength(denseTasks.length + 1);
		expect(screen.getByRole('columnheader', { name: /181-105-0001 Task 1/ })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: /181-105-0018 Task 18/ })).toBeTruthy();
		expect(bodyRows).toHaveLength(densePersonnel.length + 1);
		expect(container.querySelector('.matrix-scroll')).toBe(scrollContainer);
	});
});
