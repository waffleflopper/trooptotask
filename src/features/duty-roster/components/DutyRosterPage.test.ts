// @vitest-environment happy-dom
import type { ComponentProps } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import DutyRosterPage from './DutyRosterPage.svelte';
import type { DutyEvent, DutyEventSeriesApplyResult, DutyTemplate } from '../duty-roster.types';
import type { Personnel } from '$lib/types';

const { invalidateAllMock } = vi.hoisted(() => ({
	invalidateAllMock: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	invalidateAll: invalidateAllMock
}));

vi.mock('./DutyRosterWizard.svelte', async () => ({
	default: (await import('./test-stubs/DutyRosterWizardHarness.svelte')).default
}));

vi.mock('./AdvancedDutyTemplateBuilder.svelte', async () => ({
	default: (await import('./test-stubs/PassiveStub.svelte')).default
}));

vi.mock('./AppliedEventManager.svelte', async () => ({
	default: (await import('./test-stubs/AppliedEventManagerHarness.svelte')).default
}));

vi.mock('$lib/components/PageToolbar.svelte', async () => ({
	default: (await import('./test-stubs/PassiveStub.svelte')).default
}));

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
		orgId: 'test-org',
		isPrivileged: true,
		isFullEditor: true,
		readOnly: false
	})
}));

vi.mock('$features/calendar/stores/statusTypes.svelte', () => ({
	statusTypesStore: { items: [] }
}));

vi.mock('$features/calendar/stores/availability.svelte', () => ({
	availabilityStore: { items: [] }
}));

vi.mock('$features/calendar/stores/dailyAssignments.svelte', () => ({
	dailyAssignmentsStore: {
		types: [],
		assignments: [],
		setAssignmentBatch: vi.fn(),
		updateType: vi.fn()
	}
}));

vi.mock('$features/calendar/stores/specialDays.svelte', () => ({
	specialDaysStore: { items: [] }
}));

vi.mock('../stores/dutyRosterHistory.svelte', () => ({
	dutyRosterHistoryStore: {
		items: [],
		load: vi.fn(),
		add: vi.fn(),
		remove: vi.fn()
	}
}));

vi.mock('$lib/stores/pinnedGroups.svelte', () => ({
	pinnedGroupsStore: { list: [] }
}));

vi.mock('$lib/stores/groups.svelte', () => ({
	groupsStore: { names: {}, items: [] }
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	toastStore: { success: vi.fn(), error: vi.fn() }
}));

vi.mock('$features/personnel/utils/personnelGrouping', () => ({
	groupAndSortPersonnel: vi.fn(() => [])
}));

vi.mock('$lib/utils/scopePersonnel', () => ({
	scopePersonnelByGroup: vi.fn((value) => value)
}));

function makeTemplate(overrides: Partial<DutyTemplate> = {}): DutyTemplate {
	return {
		id: 'tmpl-staff-duty',
		orgId: 'test-org',
		mode: 'advanced',
		status: 'active',
		name: 'Battalion Staff Duty',
		description: 'Overnight command coverage',
		scopeType: 'groups',
		scopeGroupIds: ['group-hq'],
		exemptPersonnelIds: [],
		exemptStatusTypeIds: [],
		coverageMode: 'timed',
		startTime: '08:00',
		endTime: '08:00',
		spansMidnight: false,
		isBlocking: true,
		cooldownHours: 24,
		softPreferences: [],
		slots: [],
		rotationBaselines: [],
		createdAt: '2026-04-04T00:00:00.000Z',
		updatedAt: '2026-04-04T00:00:00.000Z',
		...overrides
	};
}

function makeEvent(overrides: Partial<DutyEvent> = {}): DutyEvent {
	return {
		id: 'event-1',
		orgId: 'test-org',
		runId: 'run-1',
		templateId: 'tmpl-staff-duty',
		templateName: 'Battalion Staff Duty',
		eventDate: '2026-04-10',
		coverageMode: 'timed',
		coverageStart: '2026-04-10T08:00:00',
		coverageEnd: '2026-04-11T08:00:00',
		isBlocking: true,
		cooldownHours: 24,
		fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
		collisionSummary: { hasConflicts: false, conflicts: [] },
		originalProposal: null,
		rulesSnapshot: {
			templateId: 'tmpl-staff-duty',
			templateName: 'Battalion Staff Duty',
			templateStatus: 'active',
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			isBlocking: true,
			cooldownHours: 24,
			softPreferences: [],
			slots: []
		},
		slotInstances: [],
		createdAt: '2026-04-04T00:00:00.000Z',
		updatedAt: '2026-04-04T00:00:00.000Z',
		...overrides
	};
}

function renderPage(overrides: Partial<ComponentProps<typeof DutyRosterPage>['data']> = {}) {
	const personnel: Personnel[] = [];
	return render(DutyRosterPage, {
		data: {
			orgId: 'test-org',
			orgName: 'Test Org',
			personnel,
			allPersonnel: personnel,
			scopedGroupId: null,
			rosterHistory: [],
			advancedDutyTemplates: [makeTemplate()],
			advancedDutyEvents: [],
			...overrides
		}
	});
}

describe('DutyRosterPage', () => {
	beforeEach(() => {
		cleanup();
		invalidateAllMock.mockReset();
		invalidateAllMock.mockResolvedValue(undefined);
		globalThis.fetch = vi.fn();
	});

	it('invalidates route data after applying an advanced duty series', async () => {
		const result: DutyEventSeriesApplyResult = {
			run: {
				id: 'run-1',
				orgId: 'test-org',
				templateId: 'tmpl-staff-duty',
				templateName: 'Battalion Staff Duty',
				pattern: 'daily',
				startDate: '2026-04-10',
				endDate: '2026-04-10',
				eventCount: 1,
				isLegacy: false,
				createdAt: '2026-04-04T12:00:00.000Z',
				updatedAt: '2026-04-04T12:00:00.000Z'
			},
			templateId: 'tmpl-staff-duty',
			templateName: 'Battalion Staff Duty',
			pattern: 'daily',
			eventDates: ['2026-04-10'],
			events: [makeEvent()]
		};

		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue(result)
		} as unknown as Response);

		renderPage();

		expect(screen.getByTestId('advanced-event-count').textContent).toBe('0');

		await fireEvent.click(screen.getByRole('button', { name: 'Apply Advanced Series' }));

		await waitFor(() => {
			expect(screen.getByTestId('advanced-event-count').textContent).toBe('1');
		});

		expect(invalidateAllMock).toHaveBeenCalledTimes(1);
	});

	it('invalidates route data after deleting an advanced duty run', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue({ deletedEvents: 1, deletedRuns: 1 })
		} as unknown as Response);

		renderPage({ advancedDutyEvents: [makeEvent()] });

		await fireEvent.click(screen.getByRole('button', { name: 'Applied Events' }));
		expect(screen.getByTestId('applied-event-count').textContent).toBe('1');

		await fireEvent.click(screen.getByRole('button', { name: 'Delete Advanced Run' }));

		await waitFor(() => {
			expect(screen.getByTestId('applied-event-count').textContent).toBe('0');
		});

		expect(invalidateAllMock).toHaveBeenCalledTimes(1);
	});

	it('counts only non-archived templates in the advanced templates tab badge', () => {
		renderPage({
			advancedDutyTemplates: [
				makeTemplate({ id: 'tmpl-active', status: 'active' }),
				makeTemplate({ id: 'tmpl-archived', status: 'archived' })
			]
		});

		expect(screen.getByRole('button', { name: 'Advanced Templates (1)' })).toBeTruthy();
	});

	it('exposes the advanced workspace shell without permanently stacking applied events under active runs', async () => {
		renderPage({ advancedDutyEvents: [makeEvent()] });

		expect(screen.getByRole('button', { name: 'Assignments / Taskings' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Advanced Workspace' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Advanced Templates (1)' })).toBeTruthy();

		expect(screen.getByRole('button', { name: 'Active Run' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Applied Events' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Apply Advanced Series' })).toBeTruthy();
		expect(screen.getByTestId('wizard-initial-view').textContent).toBe('advanced-template-list');
		expect(screen.queryByTestId('applied-event-manager')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Applied Events' }));

		expect(screen.getByTestId('applied-event-manager')).toBeTruthy();
		expect(screen.getByTestId('applied-event-count').textContent).toBe('1');
		expect(screen.queryByRole('button', { name: 'Apply Advanced Series' })).toBeNull();
	});

	it('starts simple and advanced top-level tabs in distinct roster lanes', async () => {
		renderPage();

		expect(screen.getByRole('button', { name: 'Advanced Workspace' }).getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByTestId('wizard-initial-view').textContent).toBe('advanced-template-list');

		await fireEvent.click(screen.getByRole('button', { name: 'Assignments / Taskings' }));

		expect(screen.getByRole('button', { name: 'Assignments / Taskings' }).getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByTestId('wizard-initial-view').textContent).toBe('simple-template-list');
		expect(screen.queryByRole('button', { name: 'Active Run' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Applied Events' })).toBeNull();
	});

	it('does not expose advanced workspace navigation for scoped users', async () => {
		renderPage({ scopedGroupId: 'group-hq' });

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Assignments / Taskings' }).getAttribute('aria-pressed')).toBe('true');
		});
		expect(screen.queryByRole('button', { name: 'Advanced Workspace' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Advanced Templates (1)' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Active Run' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Applied Events' })).toBeNull();
	});

	it('uses shared toolbar primitives for duty roster sections and related calendar links', async () => {
		renderPage();

		const toolbar = screen.getByRole('toolbar', { name: 'Duty roster controls' });
		const sections = screen.getByRole('group', { name: 'Duty roster sections' });
		const relatedLinks = screen.getByRole('navigation', { name: 'Related calendar pages' });

		expect(toolbar.contains(sections)).toBe(true);
		expect(toolbar.contains(relatedLinks)).toBe(true);
		expect(screen.getByRole('link', { name: 'Assignments' }).getAttribute('href')).toBe(
			'/org/test-org/calendar/assignments'
		);
		expect(screen.getByRole('link', { name: 'Calendar' }).getAttribute('href')).toBe('/org/test-org/calendar');

		const advancedWorkspaceTab = screen.getByRole('button', { name: 'Advanced Workspace' });
		const advancedTab = screen.getByRole('button', { name: 'Advanced Templates (1)' });
		expect(advancedWorkspaceTab.getAttribute('aria-pressed')).toBe('true');

		await fireEvent.click(advancedTab);

		expect(advancedTab.getAttribute('aria-pressed')).toBe('true');
	});
});
