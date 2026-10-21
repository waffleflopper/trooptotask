import { describe, expect, it } from 'vitest';
import { parseDisabledFeatures } from '$lib/access/featureSwitches';
import {
	activeDashboardSections,
	composeDashboardSections,
	dashboardSection,
	type DashboardAccess,
	type DashboardBlock,
	type QuickAddEntry
} from './dashboardSections';
import type { DashboardInputs } from './dashboardInputs';
import { DASHBOARD_SECTIONS } from './dashboardSectionRegistry';

describe('activeDashboardSections', () => {
	it('keeps every section in page order when the unit has stored no switches', () => {
		const active = activeDashboardSections(DASHBOARD_SECTIONS, parseDisabledFeatures(null));

		expect(active.map((entry) => entry.id)).toEqual([
			'availability',
			'training',
			'criticalTasks',
			'evaluations',
			'lossesAndAwards',
			'onboarding'
		]);
	});

	it('drops only the switched-off sections and never Availability', () => {
		const active = activeDashboardSections(DASHBOARD_SECTIONS, ['evaluations', 'onboarding']);

		expect(active.map((entry) => entry.id)).toEqual(['availability', 'training', 'criticalTasks', 'lossesAndAwards']);
	});
});

const inputs: DashboardInputs = {
	today: '2026-10-19',
	timeZone: 'UTC',
	forecastDays: [],
	personnel: [],
	availability: [],
	statusTypes: [],
	groups: [],
	assignmentTypes: [],
	assignments: [],
	page: {
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		viewerDay: { date: '2026-10-19', timeZone: 'UTC' },
		disabledFeatures: [],
		dashboard: {
			workspaceKey: 'dashboard',
			data: {
				availabilityEntries: [],
				assignmentTypes: [],
				todayAssignments: [],
				range: { rangeStart: '2026-10-17', rangeEnd: '2026-11-03' },
				pinnedGroups: [],
				activeOnboardings: [],
				ratingSchemeEntries: [],
				personnel: [],
				groups: [],
				statusTypes: [],
				trainingTypes: [],
				lossWarningWindowDays: 180,
				strengthFloorPercent: 80,
				awardTrackingAcknowledgedPersonnelIds: []
			},
			hydration: { orgId: 'org-1', targets: {} }
		},
		trainingSummary: null,
		ictlSummary: null,
		onboardingTrainingCompletions: []
	}
};

const access: DashboardAccess = {
	isPrivileged: false,
	canManageAvailability: true,
	canRecordTraining: false,
	canStartOnboarding: true
};
const component: DashboardBlock['component'] = () => ({});
const dialog: QuickAddEntry['dialog'] = () => ({});

describe('composeDashboardSections', () => {
	it('interleaves On duty blocks across sections and omits unavailable parts', () => {
		const sections = [
			dashboardSection('availability', {
				onDuty: [
					{ id: 'tonight-and-tomorrow', order: 10, component },
					{ id: 'coming-and-going', order: 30, component }
				]
			}),
			dashboardSection('training', {
				readiness: {
					id: 'training',
					component,
					available: (loaded, viewer) => loaded.page.dashboard.data.trainingTypes.length > 0 || viewer.isPrivileged
				}
			}),
			dashboardSection('criticalTasks', {
				onDuty: [
					{ id: 'taskings-due', order: 20, component },
					{ id: 'unavailable-duty', order: 0, component, available: () => false }
				],
				readiness: { id: 'critical-tasks', component }
			}),
			dashboardSection('evaluations', { readiness: { id: 'evaluations', component } }),
			dashboardSection('lossesAndAwards', { readiness: { id: 'arriving-and-leaving', component } })
		];

		const parts = composeDashboardSections(sections, inputs, [], access);

		expect(parts.onDutyBlocks.map((part) => part.id)).toEqual([
			'tonight-and-tomorrow',
			'taskings-due',
			'coming-and-going'
		]);
		expect(parts.readinessColumns.map((part) => part.id)).toEqual([
			'critical-tasks',
			'evaluations',
			'arriving-and-leaving'
		]);
		expect(
			composeDashboardSections(sections, inputs, [], { ...access, isPrivileged: true }).readinessColumns.map(
				(part) => part.id
			)
		).toEqual(['training', 'critical-tasks', 'evaluations', 'arriving-and-leaving']);
	});

	it('orders usable Quick add entries across sections after filtering by loaded data and access', () => {
		const sections = [
			dashboardSection('onboarding', {
				quickAdd: [{ id: 'onboarding', label: 'Start onboarding', order: 30, dialog }]
			}),
			dashboardSection('training', {
				quickAdd: [
					{
						id: 'training',
						label: 'Training record',
						order: 20,
						dialog,
						available: (_, viewer) => viewer.canRecordTraining
					}
				]
			}),
			dashboardSection('availability', {
				quickAdd: [
					{ id: 'status', label: 'Status', order: 10, dialog, available: (_, viewer) => viewer.canManageAvailability },
					{
						id: 'assignment',
						label: 'Assign duty',
						order: 0,
						dialog,
						available: (loaded) => loaded.assignmentTypes.length > 0
					}
				]
			})
		];

		expect(composeDashboardSections(sections, inputs, [], access).quickAdd.map((entry) => entry.id)).toEqual([
			'status',
			'onboarding'
		]);
		expect(
			composeDashboardSections(sections, inputs, [], { ...access, canRecordTraining: true }).quickAdd.map(
				(entry) => entry.id
			)
		).toEqual(['status', 'training', 'onboarding']);
	});
});
