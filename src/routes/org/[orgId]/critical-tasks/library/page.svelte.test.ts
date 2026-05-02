// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';

const { mockOrgContext } = vi.hoisted(() => ({
	mockOrgContext: {
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		isFullEditor: true,
		permissions: {},
		scopedGroupId: null,
		readOnly: false,
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: 'configure',
			onboarding: 'configure',
			ratingScheme: 'configure'
		},
		scopeSet: { kind: 'organization' },
		affordanceForFeatureAction(action: { owner: { lane: string }; requiredCapability: string; accessMode: string }) {
			const levels = ['none', 'view', 'operate', 'configure'];
			const actual = this.capabilityMap[action.owner.lane as keyof typeof this.capabilityMap] ?? 'none';
			const hasCapability = levels.indexOf(actual) >= levels.indexOf(action.requiredCapability);
			const readOnlyBlocked = this.readOnly && action.accessMode === 'write';
			return {
				allowed: hasCapability && !readOnlyBlocked,
				visible: hasCapability,
				disabled: hasCapability && readOnlyBlocked,
				reason: readOnlyBlocked
					? 'denied:read-only-overlay'
					: hasCapability
						? 'allowed:capability'
						: 'denied:missing-capability',
				explanation: '',
				decision: {}
			};
		}
	}
}));

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => mockOrgContext
}));

const medicTask: IctTask = {
	id: 'task-medic',
	taskCode: '181-105-1001',
	title: 'Perform tactical combat casualty care',
	description: null,
	category: 'Medical',
	mos: ['68W'],
	expirationMonths: 12,
	sortOrder: 0,
	archivedAt: null,
	createdAt: '2026-04-01T12:00:00Z'
};

const infantryTask: IctTask = {
	...medicTask,
	id: 'task-infantry',
	taskCode: '071-COM-1001',
	title: 'React to contact',
	category: 'Battle Drill',
	mos: ['11B'],
	sortOrder: 1
};

describe('critical tasks library route', () => {
	beforeEach(() => {
		mockOrgContext.readOnly = false;
		ictTasksStore.load([medicTask, infantryTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		ictTasksStore.load([], 'org-test-reset');
		personnelIctCompletionsStore.load([], 'org-test-reset');
	});

	it('wires task library toolbar search, filters, and actions through the route', async () => {
		render(Page, { props: { data: { orgId: 'org-1', criticalTasksLibrary: {} } } });

		const taskList = () => screen.getByRole('list', { name: 'ICT task library' });
		expect(within(taskList()).getByText('Perform tactical combat casualty care')).toBeTruthy();
		expect(within(taskList()).getByText('React to contact')).toBeTruthy();

		await fireEvent.input(screen.getByLabelText('Search'), { target: { value: 'contact' } });
		await waitFor(() => {
			expect(within(taskList()).queryByText('Perform tactical combat casualty care')).toBeNull();
			expect(within(taskList()).getByText('React to contact')).toBeTruthy();
		});

		await fireEvent.input(screen.getByLabelText('Search'), { target: { value: '' } });
		await fireEvent.change(screen.getByLabelText('MOS'), { target: { value: '68W' } });
		await waitFor(() => {
			expect(within(taskList()).getByText('Perform tactical combat casualty care')).toBeTruthy();
			expect(within(taskList()).queryByText('React to contact')).toBeNull();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'New Task' }));
		expect(screen.getByRole('heading', { name: 'New ICT Task' })).toBeTruthy();
	});
});
