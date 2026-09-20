// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/svelte';
import AssignmentPlannerPage from './AssignmentPlannerPage.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import type { OrgContext } from '$lib/stores/orgContext.svelte';
import type { AssignmentType, Personnel } from '$lib/types';
import { createTestOrgContext, type CreateOrgContextInput } from '$lib/test-support/orgContextBuilder';

function makeOrg(overrides: Partial<CreateOrgContextInput> = {}) {
	return createTestOrgContext({ orgId: 'org-1', userId: 'user-1', userRole: 'member', ...overrides });
}

let mockOrg: OrgContext = makeOrg();

vi.mock('$lib/stores/orgContext.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/stores/orgContext.svelte')>()),
	getOrgContext: () => mockOrg
}));

const assignmentTypes: AssignmentType[] = [
	{
		id: 'type-1',
		name: 'Charge of Quarters',
		shortName: 'CQ',
		assignTo: 'personnel',
		color: '#2563eb',
		exemptPersonnelIds: [],
		showInDateHeader: false
	}
];

const modType: AssignmentType = {
	id: 'type-mod',
	name: 'Manager on Duty',
	shortName: 'MOD',
	assignTo: 'personnel',
	color: '#dc2626',
	exemptPersonnelIds: [],
	showInDateHeader: false
};

const personnel: Personnel[] = [
	{
		id: 'person-1',
		firstName: 'Alex',
		lastName: 'Smith',
		rank: 'SGT',
		groupId: 'group-1',
		groupName: 'Alpha',
		clinicRole: '',
		mos: '11B'
	},
	{
		id: 'person-2',
		firstName: 'Jamie',
		lastName: 'Taylor',
		rank: 'CPT',
		groupId: 'group-1',
		groupName: 'Alpha',
		clinicRole: 'Provider',
		mos: 'PA'
	}
];

function renderPage(
	data: {
		orgId: string;
		orgName?: string;
		personnel?: Personnel[];
		allPersonnel?: Personnel[];
	} = {
		orgId: 'org-1',
		orgName: 'Test Org',
		personnel,
		allPersonnel: personnel
	}
) {
	return render(AssignmentPlannerPage, { props: { data } });
}

describe('AssignmentPlannerPage', () => {
	beforeEach(() => {
		cleanup();
		mockOrg = makeOrg();
		dailyAssignmentsStore.load(assignmentTypes, [], 'org-1');
		groupsStore.load([{ id: 'group-1', name: 'Alpha', sortOrder: 0 }], 'org-1');
	});

	afterEach(() => {
		cleanup();
	});

	it('renders the planner with floating toolbar actions', () => {
		renderPage();

		expect(screen.getByLabelText('Assignment planner controls')).toBeTruthy();
		expect(screen.getByText('Manual monthly coverage planning')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Duty Rosters' }).getAttribute('href')).toBe('/org/org-1/duty-rosters');
		expect(screen.getByRole('link', { name: 'Calendar' }).getAttribute('href')).toBe('/org/org-1/calendar');
		expect(screen.getByText('Quick Fill')).toBeTruthy();
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('shows all personnel in searchable assignment dropdowns regardless of assignment type shortName', async () => {
		dailyAssignmentsStore.load([modType], [], 'org-1');

		renderPage({
			orgId: 'org-1',
			orgName: 'Test Org',
			personnel,
			allPersonnel: personnel
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Select assignment type' }));
		await fireEvent.click(screen.getByRole('option', { name: 'MOD - Manager on Duty' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Select quick-fill person' }));

		const optionTexts = screen.getAllByRole('option').map((o) => o.textContent?.trim());

		expect(optionTexts).toContain('SGT Smith, Alex - Alpha');
		expect(optionTexts).toContain('CPT Taylor, Jamie - Alpha');
	});

	it('does not show a MOD-specific filter hint for any assignment type', () => {
		dailyAssignmentsStore.load([modType], [], 'org-1');

		renderPage({
			orgId: 'org-1',
			orgName: 'Test Org',
			personnel,
			allPersonnel: personnel
		});

		expect(screen.queryByText(/only personnel with MOS/i)).toBeNull();
		expect(screen.queryByText(/PA or MD/i)).toBeNull();
	});

	it('shows access restricted when the user cannot manage calendar assignments', () => {
		mockOrg = makeOrg({
			capabilityMap: {
				calendar: 'view',
				personnel: 'configure',
				training: 'configure',
				criticalTasks: 'configure',
				onboarding: 'configure',
				ratingScheme: 'configure'
			}
		});

		renderPage({
			orgId: 'org-1',
			orgName: 'Test Org',
			personnel,
			allPersonnel: personnel
		});

		expect(screen.getByText('Access restricted.')).toBeTruthy();
		expect(screen.getByText(/Calendar operation access is required to manage monthly assignments\./)).toBeTruthy();
	});

	it('allows Calendar operators to manage monthly assignments without legacy edit flags', () => {
		mockOrg = makeOrg({
			capabilityMap: {
				calendar: 'operate',
				personnel: 'view',
				training: 'view',
				criticalTasks: 'view',
				onboarding: 'view',
				ratingScheme: 'view'
			}
		});

		renderPage({
			orgId: 'org-1',
			orgName: 'Test Org',
			personnel,
			allPersonnel: personnel
		});

		expect(screen.getByText('Quick Fill')).toBeTruthy();
		expect(screen.queryByText('Access restricted.')).toBeNull();
	});
});

it('offers each Group and assignment type once and saves monthly and quick-fill choices by ID', async () => {
	mockOrg = makeOrg();
	const groupType = { ...modType, id: 'group-duty', name: 'Group Duty', shortName: 'GD', assignTo: 'group' as const };
	dailyAssignmentsStore.load([groupType, modType], [], 'org-1');
	groupsStore.load(
		[
			{ id: 'group-alpha', name: 'Alpha Renamed', sortOrder: 0 },
			{ id: 'group-bravo', name: 'Bravo', sortOrder: 1 }
		],
		'org-1'
	);
	const saved: Record<string, unknown>[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url, init) => {
			const payload = JSON.parse(init.body);
			saved.push(payload);
			return Response.json(
				payload.records
					? { inserted: payload.records.map((row: object, index: number) => ({ id: `batch-${index}`, ...row })) }
					: { id: 'saved', ...payload }
			);
		})
	);
	try {
		renderPage();
		await fireEvent.click(screen.getAllByRole('button', { name: /^Select Group Duty group for/ })[0]);
		expect(screen.getByRole('option', { name: 'Bravo' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('option', { name: 'Alpha Renamed' }));
		expect(saved[0]).toMatchObject({ assignmentTypeId: 'group-duty', assigneeId: 'group-alpha' });
		await fireEvent.click(screen.getByRole('button', { name: 'Select assignment type' }));
		expect(screen.getByRole('option', { name: 'MOD - Manager on Duty' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('option', { name: 'GD - Group Duty' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Select quick-fill group' }));
		expect(screen.getByRole('option', { name: 'Bravo' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('option', { name: 'Alpha Renamed' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
		const batch = saved.find((payload) => Array.isArray(payload.records));
		expect(batch?.records).toEqual(
			expect.arrayContaining([expect.objectContaining({ assigneeId: 'group-alpha', assignmentTypeId: 'group-duty' })])
		);
		expect((batch?.records as Array<{ assigneeId: string }>).every((row) => row.assigneeId === 'group-alpha')).toBe(
			true
		);
	} finally {
		cleanup();
		vi.unstubAllGlobals();
	}
});
