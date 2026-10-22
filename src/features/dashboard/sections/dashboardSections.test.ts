import { describe, expect, it } from 'vitest';
import { parseDisabledFeatures, type FeatureKey } from '$lib/access/featureSwitches';
import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { StatusType } from '$features/calendar/contracts';
import type { TrainingType } from '$features/training/contracts';
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	activeDashboardSections,
	composeDashboardSections,
	dashboardSection,
	type DashboardBlock,
	type QuickAddEntry,
	type ReadinessSource
} from './dashboardSections';
import { createDashboardAccess, personnelResource, type DashboardAccess } from './dashboardAccess';
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
	specialDays: [],
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
				awardTrackingAcknowledgedPersonnelIds: [],
				specialDays: []
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
		summaryFailed: false,
		onboardingTrainingCompletions: []
	}
};

const access: DashboardAccess = {
	can: (action) => action.id === 'calendar.manageAvailability' || action.id === 'onboarding.manageWorkflows'
};
const component: DashboardBlock['component'] = () => ({});
const loadDialog: QuickAddEntry['loadDialog'] = async () => ({ default: () => ({}) });
const icon: QuickAddEntry['icon'] = () => ({});

function readiness(id: string, available: (loaded: DashboardInputs) => boolean = () => true): ReadinessSource {
	return (loaded) =>
		available(loaded) ? { id, title: id, link: { label: id, href: '#' }, state: 'failed', subject: id } : null;
}

describe('composeDashboardSections', () => {
	it('interleaves On duty blocks across sections and omits unavailable parts', () => {
		const sections = [
			dashboardSection('availability', {
				onDuty: [
					{ id: 'tonight-and-tomorrow', order: 10, component },
					{ id: 'coming-and-going', order: 30, component }
				]
			}),
			dashboardSection('training', { readiness: readiness('training') }),
			dashboardSection('criticalTasks', {
				onDuty: [
					{ id: 'taskings-due', order: 20, component },
					{ id: 'unavailable-duty', order: 0, component, available: () => false }
				],
				readiness: readiness('critical-tasks')
			}),
			dashboardSection('evaluations', {
				readiness: readiness('evaluations', (loaded) => loaded.page.dashboard.data.ratingSchemeEntries.length > 0)
			}),
			dashboardSection('lossesAndAwards', { readiness: readiness('arriving-and-leaving') })
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
						ratingSchemeEntries: [
							{ id: 'e1', ratedPersonId: 'p1', evalType: 'NCOER', ratingPeriodEnd: '2026-10-10', status: 'active' }
						]
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
	const alphaPerson = { id: 'p-alpha', groupId: 'alpha' } as Personnel;
	const bravoPerson = { id: 'p-bravo', groupId: 'bravo' } as Personnel;
	const withTrainingType: DashboardInputs = {
		...inputs,
		personnel: [alphaPerson, bravoPerson],
		statusTypes: [{ id: 'st1' } as StatusType],
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

	const member = (lane: 'calendar' | 'training' | 'onboarding', groupIds = ['alpha']) => ({
		membershipRole: 'member' as const,
		capabilityMap: { ...createCapabilityMap('view'), [lane]: 'operate' as const },
		scopeSet: { kind: 'groups' as const, groupIds }
	});

	it('offers each lane operator only their own entry, including a Group-scoped one', () => {
		expect(labelsFor(member('calendar'))).toEqual(['Status']);
		expect(labelsFor(member('training'))).toEqual(['Training record']);
		expect(labelsFor(member('onboarding'))).toEqual(['Start onboarding']);
	});

	it('hides an entry whose operator has no loaded person to act on, unless they can add the person', () => {
		const onlyBravo = { ...withTrainingType, personnel: [bravoPerson] };
		const nobody = { ...withTrainingType, personnel: [] };

		expect(labelsFor(member('calendar'), onlyBravo)).toEqual([]);
		expect(labelsFor(member('training'), onlyBravo)).toEqual([]);
		expect(labelsFor(member('onboarding'), onlyBravo)).toEqual([]);
		expect(labelsFor({ membershipRole: 'owner' }, nobody)).toEqual(['Start onboarding']);
	});

	it('offers Training record only when a Group-scoped operator has a non-exempt person and type pair', () => {
		const loaded: DashboardInputs = {
			...withTrainingType,
			personnel: [alphaPerson],
			page: {
				...withTrainingType.page,
				dashboard: {
					...withTrainingType.page.dashboard,
					data: {
						...withTrainingType.page.dashboard.data,
						trainingTypes: [{ id: 'sharp', canBeExempted: true, exemptPersonnelIds: ['p-alpha'] } as TrainingType]
					}
				}
			}
		};
		expect(labelsFor(member('training'), loaded)).toEqual([]);
		loaded.page.dashboard.data.trainingTypes[0].exemptPersonnelIds = [];
		expect(labelsFor(member('training'), loaded)).toEqual(['Training record']);
	});

	it('hides Start onboarding once everyone the viewer may choose has a packet, unless they can add the person', () => {
		const allStarted: DashboardInputs = {
			...withTrainingType,
			personnel: [alphaPerson],
			page: {
				...withTrainingType.page,
				dashboard: {
					...withTrainingType.page.dashboard,
					data: {
						...withTrainingType.page.dashboard.data,
						activeOnboardings: [
							{ id: 'packet-1', personnelId: alphaPerson.id, steps: [] } as unknown as PersonnelOnboarding
						]
					}
				}
			}
		};

		expect(labelsFor(member('onboarding'), allStarted)).toEqual([]);
		expect(labelsFor({ membershipRole: 'owner' }, allStarted)).toEqual([
			'Status',
			'Training record',
			'Start onboarding'
		]);
	});

	it('offers a Dashboard viewer nothing', () => {
		expect(labelsFor({ membershipRole: 'member', capabilityMap: createCapabilityMap('view') })).toEqual([]);
	});

	it('drops Status until a status type exists, Training record until a Training type exists, and entries whose feature is off', () => {
		expect(labelsFor({ membershipRole: 'owner' }, { ...withTrainingType, statusTypes: [] })).toEqual([
			'Training record',
			'Start onboarding'
		]);
		expect(labelsFor({ membershipRole: 'owner' }, { ...withTrainingType, page: inputs.page })).toEqual([
			'Status',
			'Start onboarding'
		]);
		expect(labelsFor({ membershipRole: 'owner' }, withTrainingType, ['training', 'onboarding'])).toEqual(['Status']);
	});
});

describe('the Needs you actions', () => {
	const leaving = (id: string, groupId: string) =>
		({ id, rank: 'SPC', lastName: id, firstName: 'Ana', groupId, ets: '2026-11-16' }) as Personnel;
	const loaded: DashboardInputs = {
		...inputs,
		personnel: [leaving('alpha-1', 'alpha'), leaving('bravo-1', 'bravo')],
		page: {
			...inputs.page,
			dashboard: {
				...inputs.page.dashboard,
				data: {
					...inputs.page.dashboard.data,
					ratingSchemeEntries: [
						{ id: 'e1', ratedPersonId: 'alpha-1', evalType: 'NCOER', ratingPeriodEnd: '2026-10-01', status: 'active' }
					]
				}
			}
		}
	};

	function actionsFor(viewer: Parameters<typeof createClientAccess>[0]) {
		const access = createDashboardAccess(createClientAccess(viewer));
		return composeDashboardSections(DASHBOARD_SECTIONS, loaded, [], access).needsYou.ranked.map((item) => [
			item.id,
			item.action?.label ?? null
		]);
	}

	it('gives an owner every row its action', () => {
		expect(actionsFor({ membershipRole: 'owner' })).toEqual([
			['overdue:e1', 'Update status'],
			['leaving:alpha-1', 'Award started'],
			['leaving:bravo-1', 'Award started']
		]);
	});

	it('keeps the rows but drops actions the viewer may not take, per person for a Group-scoped operator', () => {
		expect(
			actionsFor({
				membershipRole: 'member',
				capabilityMap: { ...createCapabilityMap('view'), personnel: 'operate' },
				scopeSet: { kind: 'groups', groupIds: ['alpha'] }
			})
		).toEqual([
			['overdue:e1', null],
			['leaving:alpha-1', 'Award started'],
			['leaving:bravo-1', null]
		]);
		expect(actionsFor({ membershipRole: 'member', capabilityMap: createCapabilityMap('view') })).toEqual([
			['overdue:e1', null],
			['leaving:alpha-1', null],
			['leaving:bravo-1', null]
		]);
	});
});
