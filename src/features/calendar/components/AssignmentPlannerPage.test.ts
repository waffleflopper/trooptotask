// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import AssignmentPlannerPage from './AssignmentPlannerPage.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import type { OrgContext } from '$lib/stores/orgContext.svelte';
import type { AssignmentType, Personnel } from '$lib/types';

let mockOrg: OrgContext = {
	orgId: 'org-1',
	orgName: 'Test Org',
	userId: 'user-1',
	role: 'member',
	isOwner: false,
	isAdmin: false,
	isPrivileged: false,
	isFullEditor: true,
	permissions: {
		canViewCalendar: true,
		canEditCalendar: true,
		canViewPersonnel: true,
		canEditPersonnel: true,
		canViewTraining: true,
		canEditTraining: true,
		canViewOnboarding: true,
		canEditOnboarding: true,
		canViewLeadersBook: true,
		canEditLeadersBook: true,
		canManageMembers: false
	},
	scopedGroupId: null,
	readOnly: false
};

vi.mock('$lib/stores/orgContext.svelte', () => ({
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

	it('renders the planner as a full page with calendar breadcrumbs', () => {
		renderPage();

		expect(screen.getByText('Assignment Planner')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Calendar' }).getAttribute('href')).toBe('/org/org-1/calendar');
		expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/org/org-1/calendar');
		expect(screen.getByText('Quick Fill')).toBeTruthy();
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('shows all personnel in assignment dropdowns regardless of assignment type shortName', () => {
		dailyAssignmentsStore.load([modType], [], 'org-1');

		renderPage({
			orgId: 'org-1',
			orgName: 'Test Org',
			personnel,
			allPersonnel: personnel,
			scopedGroupId: null,
			permissions: { canViewCalendar: true, canEditCalendar: true }
		});

		// Both personnel should appear as options — no MOS-based filtering
		const options = screen.getAllByRole('option');
		const optionTexts = options.map((o) => o.textContent?.trim());

		expect(optionTexts).toContain('SGT Smith');
		expect(optionTexts).toContain('CPT Taylor');
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
		mockOrg = { ...mockOrg, isFullEditor: false, isAdmin: false, isOwner: false, isPrivileged: false };

		renderPage({
			orgId: 'org-1',
			orgName: 'Test Org',
			personnel,
			allPersonnel: personnel,
			scopedGroupId: null,
			permissions: { canViewCalendar: true, canEditCalendar: false }
		});

		expect(screen.getByText('Access restricted.')).toBeTruthy();
		expect(screen.getByText(/Only organization admins and full editors can manage monthly assignments\./)).toBeTruthy();
	});
});
