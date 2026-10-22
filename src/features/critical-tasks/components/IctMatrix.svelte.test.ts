// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IctMatrix from './IctMatrix.svelte';
import type {
	CriticalTasksSettings,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';

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
	it('offers completion details and the Person link to a read-only matrix viewer', () => {
		render(IctMatrix, {
			props: {
				orgId: 'org-1',
				personnel: [person({ id: 'smith' })],
				tasks: [
					task({ id: 'tccc', taskCode: '181-105-1001', title: 'TCCC', mos: ['68W'] }),
					task({ id: 'infantry', taskCode: '071-326-0501', title: 'Infantry task', mos: ['11B'] })
				],
				completions: [completion({ ictTaskId: 'tccc' })],
				groups,
				settings,
				asOf: '2026-04-15'
			}
		});

		expect(screen.getByRole('link', { name: /Smith, Jane/ }).getAttribute('href')).toBe(
			'/org/org-1/critical-tasks/smith'
		);
		const currentCell = screen.getByRole('button', {
			name: /Smith 181-105-1001: current. TCCC: current. Completed 2026-04-01. Expires 2027-04-01./
		});
		expect(currentCell.getAttribute('aria-label')).toContain('Validated by SFC Observer');
		expect(screen.getByLabelText('Smith, Jane readiness 100%')).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Smith 071-326-0501/ })).toBeNull();
		expect(screen.getByLabelText('Smith 071-326-0501: not applicable')).toBeTruthy();
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
	it('shows the first person again after a filter empties the matrix and is cleared', async () => {
		const roster = Array.from({ length: 30 }, (_, index) =>
			person({ id: `person-${index + 1}`, lastName: `Soldier ${index + 1}` })
		);
		const props = {
			orgId: 'org-1',
			personnel: roster,
			tasks: [task({ id: 'task-1', taskCode: '181-105-1001' })],
			completions: [],
			groups,
			settings,
			viewMode: 'alphabetical' as const,
			canEdit: true,
			onSelectCell: vi.fn(),
			orgName: 'Test Unit'
		};
		const { rerender } = render(IctMatrix, { props });

		await fireEvent.scroll(screen.getByTestId('critical-tasks-matrix-scroll'), {
			target: { scrollTop: 2000 }
		});
		await rerender({ ...props, personnel: [] });
		expect(screen.getByText('No personnel match the current filters.')).toBeTruthy();
		await rerender({ ...props, personnel: roster });

		expect(screen.getByRole('button', { name: /Soldier 1 181-105-1001: not recorded/ })).toBeTruthy();
	});
});
