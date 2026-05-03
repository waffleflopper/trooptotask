// @vitest-environment happy-dom
import type { ComponentProps } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import DutyRosterPage from './DutyRosterPage.svelte';
import type {
	AdvancedDutyRunSnapshotRecord,
	DutyEvent,
	DutyEventSeriesApplyResult,
	DutyTemplate
} from '../duty-roster.types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
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

const { orgContextMock } = vi.hoisted(() => ({
	orgContextMock: {
		orgId: 'test-org',
		isPrivileged: true,
		isFullEditor: true,
		readOnly: false,
		scopeSet: { kind: 'organization' } as { kind: 'organization' } | { kind: 'groups'; groupIds: string[] },
		affordanceForFeatureAction: vi.fn((action: { id: string }) => ({ allowed: Boolean(action.id) }))
	}
}));

function mockCalendarActionAccess(overrides: Record<string, boolean>): void {
	orgContextMock.affordanceForFeatureAction.mockImplementation((action: { id: string }) => ({
		allowed: overrides[action.id] ?? true
	}));
}

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => orgContextMock
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
	scopePersonnelByGroupScopeSet: vi.fn((value) => value)
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

function makeSnapshot(overrides: Partial<AdvancedDutyRunSnapshotRecord> = {}): AdvancedDutyRunSnapshotRecord {
	return {
		id: 'snapshot-1',
		orgId: 'test-org',
		templateId: 'tmpl-staff-duty',
		templateName: 'Battalion Staff Duty',
		pattern: 'daily',
		startDate: '2026-04-10',
		endDate: '2026-04-12',
		eventCount: 3,
		eventDates: ['2026-04-10', '2026-04-11', '2026-04-12'],
		candidatePersonnelIds: ['person-1', 'person-2'],
		draftLineageKey: 'lineage-1',
		snapshotFingerprint: 'fingerprint-1',
		snapshotVersion: 1,
		status: 'draft',
		inputPayload: {},
		snapshotPayload: {},
		previewPayload: {},
		exportModel: null,
		createdByUserId: 'user-1',
		appliedRunId: null,
		applyError: null,
		expiresAt: '2026-04-11T12:00:00.000Z',
		appliedAt: null,
		createdAt: '2026-04-10T12:00:00.000Z',
		updatedAt: '2026-04-10T12:00:00.000Z',
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
			rosterHistory: [],
			advancedDutyTemplates: [makeTemplate()],
			advancedDutyEvents: [],
			advancedDutySnapshots: [],
			...overrides
		}
	});
}

describe('DutyRosterPage', () => {
	beforeEach(() => {
		cleanup();
		invalidateAllMock.mockReset();
		invalidateAllMock.mockResolvedValue(undefined);
		orgContextMock.orgId = 'test-org';
		orgContextMock.isPrivileged = true;
		orgContextMock.isFullEditor = true;
		orgContextMock.readOnly = false;
		orgContextMock.scopeSet = { kind: 'organization' };
		mockCalendarActionAccess({});
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
		expect(screen.getByRole('button', { name: 'Draft Snapshots (0)' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Applied Events' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Apply Advanced Series' })).toBeTruthy();
		expect(screen.getByTestId('wizard-initial-view').textContent).toBe('advanced-template-list');
		expect(screen.queryByTestId('applied-event-manager')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Applied Events' }));

		expect(screen.getByTestId('applied-event-manager')).toBeTruthy();
		expect(screen.getByTestId('applied-event-count').textContent).toBe('1');
		expect(screen.queryByRole('button', { name: 'Apply Advanced Series' })).toBeNull();
	});

	it('lets users inspect and resume draft advanced duty snapshots', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce(
			new Response(
				JSON.stringify(
					makeSnapshot({
						previewPayload: {
							templateId: 'tmpl-staff-duty',
							templateName: 'Battalion Staff Duty',
							pattern: 'daily',
							eventDates: ['2026-04-10', '2026-04-11', '2026-04-12'],
							events: []
						}
					})
				),
				{ status: 200 }
			)
		);
		renderPage({ advancedDutySnapshots: [makeSnapshot()] });

		await fireEvent.click(screen.getByRole('button', { name: 'Draft Snapshots (1)' }));

		expect(screen.getByRole('region', { name: 'Draft advanced duty snapshots' })).toBeTruthy();
		expect(screen.getAllByText('Battalion Staff Duty').length).toBeGreaterThan(0);
		expect(screen.getByRole('complementary', { name: 'Snapshot details' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Resume Snapshot' }));

		await waitFor(() => {
			expect(screen.getByTestId('wizard-initial-view').textContent).toBe('advanced-template-list');
		});
		expect(screen.getByTestId('wizard-resume-snapshot').textContent).toBe('snapshot-1');
		expect(globalThis.fetch).toHaveBeenCalledWith('/org/test-org/api/duty-events/snapshots/snapshot-1');
	});

	it('replaces the in-memory draft snapshot when manual override previews create a new snapshot id', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					snapshotId: 'snapshot-override',
					snapshotFingerprint: 'fingerprint-override',
					snapshotVersion: 1,
					templateId: 'tmpl-staff-duty',
					templateName: 'Battalion Staff Duty',
					pattern: 'daily',
					eventDates: ['2026-04-10', '2026-04-11', '2026-04-12'],
					events: []
				}),
				{ status: 200 }
			)
		);
		renderPage({
			advancedDutySnapshots: [
				makeSnapshot({
					id: 'snapshot-loaded',
					inputPayload: {
						templateId: 'tmpl-staff-duty',
						startDate: '2026-04-10',
						endDate: '2026-04-12',
						pattern: 'daily'
					}
				})
			]
		});

		expect(screen.getByRole('button', { name: 'Draft Snapshots (1)' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Preview Advanced Series Override' }));

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Draft Snapshots (1)' })).toBeTruthy();
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Draft Snapshots (1)' }));

		expect(screen.getByText('1 draft snapshot')).toBeTruthy();
		expect(screen.queryByText('2 draft snapshots')).toBeNull();
		expect(screen.getByRole('button', { name: 'Resume Snapshot' })).toBeTruthy();
	});

	it('keeps resumable advanced snapshots in the draft snapshot workspace after reload-style data loads', async () => {
		renderPage({
			advancedDutySnapshots: [
				makeSnapshot({ id: 'snapshot-draft', status: 'draft' }),
				makeSnapshot({ id: 'snapshot-applying', status: 'applying' }),
				makeSnapshot({ id: 'snapshot-failed', status: 'apply-failed' }),
				makeSnapshot({ id: 'snapshot-partial', status: 'partial-failure' }),
				makeSnapshot({ id: 'snapshot-applied', status: 'applied' })
			]
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Draft Snapshots (4)' }));

		expect(screen.getByRole('region', { name: 'Draft advanced duty snapshots' })).toBeTruthy();
		expect(screen.getByText('4 draft snapshots')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Resume Snapshot' })).toBeTruthy();
	});

	it('does not offer delete actions for snapshots while apply is in progress', async () => {
		renderPage({
			advancedDutySnapshots: [makeSnapshot({ id: 'snapshot-applying', status: 'applying' })]
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Draft Snapshots (1)' }));

		expect(screen.queryByRole('button', { name: 'Delete Snapshot' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Delete snapshot for Battalion Staff Duty' })).toBeNull();
	});

	it('lets users delete a draft advanced duty snapshot from the snapshot workspace', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
		renderPage({ advancedDutySnapshots: [makeSnapshot()] });

		await fireEvent.click(screen.getByRole('button', { name: 'Draft Snapshots (1)' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete Snapshot' }));
		await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete Snapshot' }));

		await waitFor(() => {
			expect(screen.getByText('No draft snapshots')).toBeTruthy();
		});
		expect(globalThis.fetch).toHaveBeenCalledWith('/org/test-org/api/duty-events/snapshots/snapshot-1', {
			method: 'DELETE'
		});
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
		orgContextMock.scopeSet = { kind: 'groups', groupIds: ['group-hq'] };

		renderPage();

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Assignments / Taskings' }).getAttribute('aria-pressed')).toBe('true');
		});
		expect(screen.queryByRole('button', { name: 'Advanced Workspace' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Advanced Templates (1)' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Active Run' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Applied Events' })).toBeNull();
	});

	it('uses policy affordances instead of full-editor compatibility for advanced duty access', async () => {
		orgContextMock.isPrivileged = false;
		orgContextMock.isFullEditor = true;
		mockCalendarActionAccess({
			[POLICY_ACTION_CATALOG.calendar.manageAssignments.id]: false
		});

		renderPage();

		expect(screen.getByText('Calendar operation access is required to manage duty rosters.')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Advanced Workspace' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Advanced Templates (1)' })).toBeNull();
	});

	it('allows assignment operators to manage rosters without configuration access', () => {
		orgContextMock.isPrivileged = false;
		orgContextMock.isFullEditor = false;
		mockCalendarActionAccess({
			[POLICY_ACTION_CATALOG.calendar.manageAssignments.id]: true,
			[POLICY_ACTION_CATALOG.calendar.configureAssignmentTypes.id]: false
		});

		renderPage();

		expect(screen.queryByText('Calendar operation access is required to manage duty rosters.')).toBeNull();
		expect(screen.getByRole('button', { name: 'Advanced Workspace' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Advanced Templates (1)' })).toBeNull();
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
