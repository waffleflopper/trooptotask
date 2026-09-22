// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, cleanup, waitFor, act } from '@testing-library/svelte';
import AssignmentPlannerPage from './AssignmentPlannerPage.svelte';
import { calendarStore } from '$features/calendar/stores/calendar.svelte';
import type { CalendarWorkspaceData } from '$features/calendar/calendar.types';
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
		calendar?: { data: CalendarWorkspaceData };
	} = {
		orgId: 'org-1',
		orgName: 'Test Org',
		personnel,
		allPersonnel: personnel
	}
) {
	return render(AssignmentPlannerPage, {
		props: {
			data: {
				...data,
				calendar: data.calendar ?? {
					data: { personnel, allPersonnel: personnel, rangeStart: '2026-08-01', rangeEnd: '2026-10-31' }
				}
			}
		}
	});
}

describe('AssignmentPlannerPage', () => {
	beforeEach(() => {
		cleanup();
		mockOrg = makeOrg();
		calendarStore.goToMonth(2026, 8);
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
		expect(screen.queryByRole('link', { name: 'Duty Rosters' })).toBeNull();
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
	calendarStore.goToMonth(2026, 8);
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

describe('planner visible-month loading', () => {
	beforeEach(() => {
		mockOrg = makeOrg();
		calendarStore.goToMonth(2026, 8);
		dailyAssignmentsStore.load(assignmentTypes, [], 'org-1');
		groupsStore.load([{ id: 'group-1', name: 'Alpha', sortOrder: 0 }], 'org-1');
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});
	const staleBootstrap = {
		orgId: 'org-1',
		calendar: { data: { personnel, rangeStart: '2026-11-01', rangeEnd: '2027-01-31' } }
	};
	const saved = {
		id: 'saved-september',
		organizationId: 'org-1',
		date: '2026-09-22',
		assignmentTypeId: 'type-1',
		assigneeId: 'person-1'
	};
	function response(assignments = [saved], rangeStart = '2026-09-01', rangeEnd = '2026-10-31') {
		return Response.json({
			rangeStart,
			rangeEnd,
			dailyAssignments: assignments,
			availabilityEntries: [],
			specialDays: []
		});
	}
	it('loads the displayed month on a cold start outside bootstrap coverage before offering edits', async () => {
		let resolve!: (value: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((r) => {
						resolve = r;
					})
			)
		);
		renderPage(staleBootstrap);
		expect(screen.queryByRole('button', { name: 'Select Charge of Quarters assignee for 2026-09-22' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Clear all Charge of Quarters' })).toBeNull();
		await waitFor(() => expect(resolve).toBeTypeOf('function'));
		resolve(response());
		await waitFor(() =>
			expect(
				screen.getByRole('button', { name: 'Select Charge of Quarters assignee for 2026-09-22' }).textContent
			).toContain('Smith')
		);
		expect(document.cookie).toContain('ttt-calendar-anchor-date=2026-09-01');
	});
	it('keeps failed dates non-editable and recovers the saved slot on explicit retry', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(new Response('', { status: 503 }))
				.mockResolvedValueOnce(response())
		);
		renderPage(staleBootstrap);
		const retry = await screen.findByRole('button', { name: 'Retry calendar load' });
		expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Clear all Charge of Quarters' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Select Charge of Quarters assignee for 2026-09-22' })).toBeNull();
		await fireEvent.click(retry);
		await waitFor(() =>
			expect(
				screen.getByRole('button', { name: 'Select Charge of Quarters assignee for 2026-09-22' }).textContent
			).toContain('Smith')
		);
	});
	it('loads far-month assignments after navigation and ignores a superseded response', async () => {
		const pending: Array<(value: Response) => void> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						pending.push(resolve);
					})
			)
		);
		renderPage();
		await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
		await waitFor(() => expect(pending).toHaveLength(1));
		expect(screen.queryByRole('button', { name: 'Clear all Charge of Quarters' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
		await waitFor(() => expect(pending).toHaveLength(2));
		pending[1](response([{ ...saved, id: 'saved-december', date: '2026-12-31' }], '2026-11-01', '2026-12-31'));
		await waitFor(() =>
			expect(
				screen.getByRole('button', { name: 'Select Charge of Quarters assignee for 2026-12-31' }).textContent
			).toContain('Smith')
		);
		await act(async () => {
			pending[0](
				response(
					[{ ...saved, id: 'stale-november', date: '2026-11-15', assigneeId: 'person-2' }],
					'2026-11-01',
					'2026-11-30'
				)
			);
		});
		expect(dailyAssignmentsStore.assignments.map((row) => row.id)).toEqual(['saved-december']);

		expect(calendarStore.currentDate.getMonth()).toBe(11);
	});
	it('does not merge a late response into a different organization after navigation', async () => {
		let resolve!: (value: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((r) => {
						resolve = r;
					})
			)
		);
		const view = renderPage(staleBootstrap);
		await waitFor(() => expect(resolve).toBeTypeOf('function'));
		dailyAssignmentsStore.load(assignmentTypes, [{ ...saved, id: 'other-org', assigneeId: 'person-2' }], 'org-2');
		await view.rerender({
			data: { orgId: 'org-2', calendar: { data: { personnel, rangeStart: '2026-09-01', rangeEnd: '2026-09-30' } } }
		});
		await act(async () => {
			resolve(response());
		});
		expect(dailyAssignmentsStore.orgId).toBe('org-2');
		expect(dailyAssignmentsStore.assignments.map((row) => row.id)).toEqual(['other-org']);
		expect(
			screen.getByRole('button', { name: 'Select Charge of Quarters assignee for 2026-09-22' }).textContent
		).toContain('Taylor');
	});
});
