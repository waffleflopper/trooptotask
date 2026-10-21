import { describe, expect, it } from 'vitest';
import { parseDisabledFeatures, type FeatureKey } from '$lib/access/featureSwitches';
import type { TrainingType } from '$features/training/contracts';
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	activeDashboardSections,
	composeDashboardSections,
	createDashboardAccess,
	dashboardSection,
	personnelResource,
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
			hydration: {
				orgId: 'org-1',
				confirmedChangesByTab: {},
				personnel: { mode: 'replace', snapshotKey: 'personnel', items: [] },
				groups: { mode: 'replace', snapshotKey: 'groups', items: [] },
				statusTypes: { mode: 'replace', snapshotKey: 'statusTypes', items: [] },
				trainingTypes: { mode: 'replace', snapshotKey: 'trainingTypes', items: [] },
				pinnedGroups: { mode: 'replace', snapshotKey: 'pinnedGroups', items: [] },
				availabilityEntries: {
					mode: 'range',
					snapshotKey: 'availability',
					items: [],
					range: { rangeStart: '2026-10-17', rangeEnd: '2026-11-03' }
				},
				calendarAssignments: {
					mode: 'range',
					snapshotKey: 'assignments',
					items: { types: [], assignments: [] },
					range: { rangeStart: '2026-10-17', rangeEnd: '2026-11-03' }
				}
			}
		},
		trainingSummary: null,
		ictlSummary: null,
		onboardingTrainingCompletions: []
	}
};

const access: DashboardAccess = {
	can: (action) => action.id === 'calendar.manageAvailability' || action.id === 'onboarding.manageWorkflows'
};
const component: DashboardBlock['component'] = () => ({});
const loadDialog: QuickAddEntry['loadDialog'] = async () => ({ default: () => ({}) });
const icon: QuickAddEntry['icon'] = () => ({});

describe('composeDashboardSections', () => {
	it('interleaves On duty blocks across sections and omits unavailable parts', () => {
		const sections = [
			dashboardSection('availability', {
				onDuty: [
					{ id: 'tonight-and-tomorrow', order: 10, component },
					{ id: 'coming-and-going', order: 30, component }
				]
			}),
			dashboardSection('training', { readiness: { id: 'training', component } }),
			dashboardSection('criticalTasks', {
				onDuty: [
					{ id: 'taskings-due', order: 20, component },
					{ id: 'unavailable-duty', order: 0, component, available: () => false }
				],
				readiness: { id: 'critical-tasks', component }
			}),
			dashboardSection('evaluations', {
				readiness: {
					id: 'evaluations',
					component,
					available: (loaded) => loaded.page.dashboard.data.ratingSchemeEntries.length > 0
				}
			}),
			dashboardSection('lossesAndAwards', { readiness: { id: 'arriving-and-leaving', component } })
		];

		const parts = composeDashboardSections(sections, inputs, [], access);

		expect(parts.onDutyBlocks.map((part) => part.id)).toEqual([
			'tonight-and-tomorrow',
			'taskings-due',
			'coming-and-going'
		]);
		expect(parts.readinessColumns.map((part) => part.id)).toEqual([
			'training',
			'critical-tasks',
			'arriving-and-leaving'
		]);
		const withEvaluations: DashboardInputs = {
			...inputs,
			page: {
				...inputs.page,
				dashboard: {
					...inputs.page.dashboard,
					data: {
						...inputs.page.dashboard.data,
						ratingSchemeEntries: [{ ratingPeriodEnd: '2026-10-10', status: 'active' }]
					}
				}
			}
		};
		expect(
			composeDashboardSections(sections, withEvaluations, [], access).readinessColumns.map((part) => part.id)
		).toEqual(['training', 'critical-tasks', 'evaluations', 'arriving-and-leaving']);
	});

	it('orders usable Quick add entries across sections after filtering by loaded data and access', () => {
		const sections = [
			dashboardSection('onboarding', {
				quickAdd: [{ id: 'onboarding', label: 'Start onboarding', order: 30, loadDialog, icon }]
			}),
			dashboardSection('training', {
				quickAdd: [
					{
						id: 'training',
						label: 'Training record',
						order: 20,
						loadDialog,
						icon,
						available: (_, viewer) => viewer.can(POLICY_ACTION_CATALOG.training.recordCompletions)
					}
				]
			}),
			dashboardSection('availability', {
				quickAdd: [
					{
						id: 'status',
						label: 'Status',
						order: 10,
						loadDialog,
						icon,
						available: (_, viewer) => viewer.can(POLICY_ACTION_CATALOG.calendar.manageAvailability)
					},
					{
						id: 'assignment',
						label: 'Assign duty',
						order: 0,
						loadDialog,
						icon,
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
			composeDashboardSections(sections, inputs, [], { ...access, can: () => true }).quickAdd.map((entry) => entry.id)
		).toEqual(['status', 'training', 'onboarding']);
	});
});

describe('createDashboardAccess', () => {
	const manageAvailability = POLICY_ACTION_CATALOG.calendar.manageAvailability;

	it('lets a Group-scoped operator act somewhere, but only on people in their groups', () => {
		const access = createDashboardAccess(
			createClientAccess({
				membershipRole: 'member',
				capabilityMap: { ...createCapabilityMap('view'), calendar: 'operate' },
				scopeSet: { kind: 'groups', groupIds: ['alpha'] }
			})
		);

		expect(access.can(manageAvailability)).toBe(true);
		expect(access.can(manageAvailability, personnelResource({ groupId: 'alpha' }))).toBe(true);
		expect(access.can(manageAvailability, personnelResource({ groupId: 'bravo' }))).toBe(false);
		expect(access.can(manageAvailability, personnelResource({ groupId: null }))).toBe(false);
		expect(access.can(POLICY_ACTION_CATALOG.training.recordCompletions)).toBe(false);
	});

	it('denies a view-only member everywhere', () => {
		const access = createDashboardAccess(
			createClientAccess({ membershipRole: 'member', capabilityMap: createCapabilityMap('view') })
		);

		expect(access.can(manageAvailability)).toBe(false);
		expect(access.can(manageAvailability, personnelResource({ groupId: null }))).toBe(false);
	});
});

describe('the Quick add entries', () => {
	const withTrainingType: DashboardInputs = {
		...inputs,
		page: {
			...inputs.page,
			dashboard: {
				...inputs.page.dashboard,
				data: { ...inputs.page.dashboard.data, trainingTypes: [{ id: 'tt1' } as TrainingType] }
			}
		}
	};

	function labelsFor(
		viewer: Parameters<typeof createClientAccess>[0],
		loaded = withTrainingType,
		disabled = [] as FeatureKey[]
	) {
		const access = createDashboardAccess(createClientAccess(viewer));
		return composeDashboardSections(DASHBOARD_SECTIONS, loaded, disabled, access).quickAdd.map((entry) => entry.label);
	}

	it('offers an owner Status, then Training record, then Start onboarding', () => {
		expect(labelsFor({ membershipRole: 'owner' })).toEqual(['Status', 'Training record', 'Start onboarding']);
	});

	it('offers each lane operator only their own entry, including a Group-scoped one', () => {
		const member = (lane: 'calendar' | 'training' | 'onboarding') => ({
			membershipRole: 'member' as const,
			capabilityMap: { ...createCapabilityMap('view'), [lane]: 'operate' as const },
			scopeSet: { kind: 'groups' as const, groupIds: ['alpha'] }
		});

		expect(labelsFor(member('calendar'))).toEqual(['Status']);
		expect(labelsFor(member('training'))).toEqual(['Training record']);
		expect(labelsFor(member('onboarding'))).toEqual(['Start onboarding']);
	});

	it('offers a Dashboard viewer nothing', () => {
		expect(labelsFor({ membershipRole: 'member', capabilityMap: createCapabilityMap('view') })).toEqual([]);
	});

	it('drops Training record until a Training type exists, and entries whose feature is off', () => {
		expect(labelsFor({ membershipRole: 'owner' }, inputs)).toEqual(['Status', 'Start onboarding']);
		expect(labelsFor({ membershipRole: 'owner' }, withTrainingType, ['training', 'onboarding'])).toEqual(['Status']);
	});
});
