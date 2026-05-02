// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/svelte';
import AssignmentPlannerPage from './AssignmentPlannerPage.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import { createOrgContext, type OrgContext } from '$lib/stores/orgContext.svelte';
import type { AssignmentType, Personnel } from '$lib/types';

function makeOrg(overrides: Partial<OrgContext> = {}): OrgContext {
	const defaultCapabilityMap = {
		calendar: 'configure',
		personnel: 'configure',
		training: 'configure',
		criticalTasks: 'configure',
		onboarding: 'configure',
		ratingScheme: 'configure'
	} satisfies OrgContext['capabilityMap'];

	return createOrgContext({
		orgId: 'org-1',
		orgName: 'Test Org',
		userId: 'user-1',
		userRole: overrides.isOwner ? 'owner' : overrides.isAdmin ? 'admin' : (overrides.role ?? 'member'),
		capabilityMap: overrides.capabilityMap ?? defaultCapabilityMap,
		scopeSet: overrides.scopeSet ?? { kind: 'organization' },
		permissions: {
			canViewCalendar: true,
			canEditCalendar: true,
			canViewPersonnel: true,
			canEditPersonnel: true,
			canViewTraining: true,
			canEditTraining: true,
			canViewCriticalTasks: true,
			canEditCriticalTasks: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canViewLeadersBook: true,
			canEditLeadersBook: true,
			canManageMembers: false
		},
		scopedGroupId: null,
		isReadOnly: overrides.readOnly ?? false
	});
}

let mockOrg: OrgContext = makeOrg({
	isFullEditor: true,
	permissions: {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canViewCriticalTasks: true,
		canEditCriticalTasks: true,
		canViewOnboarding: true,
		canEditOnboarding: true,
		canViewLeadersBook: true,
		canEditLeadersBook: true,
		canManageMembers: false
	}
});

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
		scopedGroupId?: string | null;
		permissions?: { canViewCalendar?: boolean; canEditCalendar?: boolean } | null;
	} = {
		orgId: 'org-1',
		orgName: 'Test Org',
		personnel,
		allPersonnel: personnel,
		scopedGroupId: null,
		permissions: { canViewCalendar: true, canEditCalendar: true }
	}
) {
	return render(AssignmentPlannerPage, { props: { data } });
}

describe('AssignmentPlannerPage', () => {
	beforeEach(() => {
		cleanup();
		mockOrg = { ...mockOrg, isFullEditor: true, readOnly: false };
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
		expect(screen.getByRole('link', { name: 'Duty Roster' }).getAttribute('href')).toBe(
			'/org/org-1/calendar/duty-roster'
		);
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
			allPersonnel: personnel,
			scopedGroupId: null,
			permissions: { canViewCalendar: true, canEditCalendar: true }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Select assignment type' }));
		await fireEvent.mouseDown(screen.getByRole('option', { name: 'MOD - Manager on Duty' }));
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
			allPersonnel: personnel,
			scopedGroupId: null,
			permissions: { canViewCalendar: true, canEditCalendar: true }
		});

		expect(screen.queryByText(/only personnel with MOS/i)).toBeNull();
		expect(screen.queryByText(/PA or MD/i)).toBeNull();
	});

	it('shows access restricted when the user cannot manage calendar assignments', () => {
		mockOrg = makeOrg({
			isFullEditor: false,
			isAdmin: false,
			isOwner: false,
			isPrivileged: false,
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
			allPersonnel: personnel,
			scopedGroupId: null,
			permissions: { canViewCalendar: true, canEditCalendar: false }
		});

		expect(screen.getByText('Access restricted.')).toBeTruthy();
		expect(screen.getByText(/Calendar operation access is required to manage monthly assignments\./)).toBeTruthy();
	});

	it('allows Calendar operators to manage monthly assignments without legacy edit flags', () => {
		mockOrg = makeOrg({
			isFullEditor: false,
			isAdmin: false,
			isOwner: false,
			isPrivileged: false,
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
			allPersonnel: personnel,
			scopedGroupId: null,
			permissions: { canViewCalendar: true, canEditCalendar: false }
		});

		expect(screen.getByText('Quick Fill')).toBeTruthy();
		expect(screen.queryByText('Access restricted.')).toBeNull();
	});
});
