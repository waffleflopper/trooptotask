// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IctMatrix from './IctMatrix.svelte';
import type {
	CriticalTasksSettings,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$features/personnel/contracts';
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
		const tcccHeader = screen.getByRole('columnheader', { name: /181-105-1001 TCCC/ });
		expect(tcccHeader).toBeTruthy();
		expect(within(tcccHeader).getByText('TCCC')).toBeTruthy();
		const personLink = screen.getByRole('link', { name: /Smith, Jane/ });
		expect(personLink.getAttribute('href')).toBe('/org/org-1/critical-tasks/smith');
		expect(personLink.textContent).toContain('SGT');
		expect(personLink.textContent).toContain('Smith, Jane');
		expect(personLink.textContent).toContain('68W');
		expect(screen.getByLabelText('Smith, Jane readiness 50%')).toBeTruthy();
		expect(screen.getByText(/Alpha/)).toBeTruthy();
		expect(screen.getByText('1 personnel (50% Readiness)')).toBeTruthy();
		expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
		expect(screen.getByText('Not Required')).toBeTruthy();

		const currentCell = screen.getByRole('button', {
			name: /Smith 181-105-1001: current. TCCC: current. Completed 2026-04-01. Expires 2027-04-01./
		});
		expect(currentCell.querySelector('[data-status="current"]')).toBeTruthy();
		currentCell.focus();
		expect(document.activeElement).toBe(currentCell);
		expect(screen.getByText('Expires 2027-04-01')).toBeTruthy();
		expect(currentCell.getAttribute('aria-label')).toContain('Validated by SFC Observer');

		const expiringCell = screen.getByRole('button', {
			name: /Smith 181-105-1002: expiring soon. Expiring task: expiring soon./
		});
		expect(expiringCell.querySelector('[data-status="expiring-soon"]')).toBeTruthy();
		expect(expiringCell.querySelector('svg')).toBeTruthy();
		expect(expiringCell.getAttribute('aria-label')).toContain('expiring soon');

		const expiredCell = screen.getByRole('button', {
			name: /Smith 181-105-1003: expired. Expired task: expired./
		});
		expect(expiredCell.querySelector('[data-status="expired"]')).toBeTruthy();
		expect(expiredCell.querySelector('svg')).toBeTruthy();
		expect(expiredCell.getAttribute('aria-label')).toContain('expired');

		expect(screen.queryByRole('button', { name: /Smith 071-326-0501/ })).toBeNull();
		expect(screen.getByLabelText('Smith 071-326-0501: not applicable')).toBeTruthy();

		const missingCell = screen.getByRole('button', { name: /Smith 999-000-0001: not recorded/ });
		expect(missingCell.querySelector('[data-status="not-recorded"]')).toBeTruthy();
		expect(missingCell.querySelector('svg')).toBeTruthy();
	});

	it('selects editable applicable cells and ignores not-applicable cells', async () => {
		const onSelectCell = vi.fn();
		render(IctMatrix, {
			props: {
				orgId: 'org-1',
				personnel: [person({ id: 'smith', mos: '68W' })],
				tasks: [
					task({ id: 'medic', taskCode: '181-105-1001', title: 'Medic task', mos: ['68W'], sortOrder: 0 }),
					task({ id: 'infantry', taskCode: '071-326-0501', title: 'Infantry task', mos: ['11B'], sortOrder: 1 })
				],
				completions: [
					completion({
						id: 'medic-completion',
						personnelId: 'smith',
						ictTaskId: 'medic',
						completedAt: '2026-04-01'
					})
				],
				groups,
				settings,
				canEdit: true,
				onSelectCell,
				asOf: '2026-04-15',
				orgName: 'Test Unit'
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Smith 181-105-1001: current/ }));
		expect(onSelectCell).toHaveBeenCalledWith({
			person: expect.objectContaining({ id: 'smith' }),
			task: expect.objectContaining({ id: 'medic' }),
			completion: expect.objectContaining({ id: 'medic-completion' })
		});

		await fireEvent.click(screen.getByLabelText('Smith 071-326-0501: not applicable'));
		expect(onSelectCell).toHaveBeenCalledTimes(1);
	});

	it('opens an editable task for a person reached by scrolling the matrix', async () => {
		const onSelectCell = vi.fn();
		render(IctMatrix, {
			props: {
				orgId: 'org-1',
				personnel: Array.from({ length: 30 }, (_, index) =>
					person({ id: `person-${index + 1}`, lastName: `Soldier ${index + 1}` })
				),
				tasks: [task({ id: 'task-1', taskCode: '181-105-1001' })],
				completions: [],
				groups,
				settings,
				viewMode: 'alphabetical',
				canEdit: true,
				onSelectCell,
				orgName: 'Test Unit'
			}
		});

		await fireEvent.scroll(screen.getByTestId('critical-tasks-matrix-scroll'), {
			target: { scrollTop: 2000 }
		});
		await waitFor(() =>
			expect(screen.getByRole('button', { name: /Soldier 30 181-105-1001: not recorded/ })).toBeTruthy()
		);
		await fireEvent.click(screen.getByRole('button', { name: /Soldier 30 181-105-1001: not recorded/ }));

		expect(onSelectCell).toHaveBeenCalledWith({
			person: expect.objectContaining({ id: 'person-30' }),
			task: expect.objectContaining({ id: 'task-1' }),
			completion: undefined
		});
	});
});
