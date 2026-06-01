import type { HydrationItems, HydrationPlan, HydrationPlannerPort, HydrationTarget, WorkspaceKey } from './orgShell';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import type { PersonnelTraining } from '$features/training/training.types';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, SpecialDay } from '$lib/types';

const deferredSnapshotKeys = new WeakMap<object, string>();
let fallbackSnapshotCounter = 0;

function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

function getDeferredSnapshotKey(value: object): string {
	let key = deferredSnapshotKeys.get(value);
	if (!key) {
		key = generateDeferredSnapshotId('deferred');
		deferredSnapshotKeys.set(value, key);
	}
	return key;
}

function generateDeferredSnapshotId(prefix: string): string {
	const randomId = globalThis.crypto?.randomUUID?.();
	if (randomId) {
		return `${prefix}:${randomId}`;
	}

	fallbackSnapshotCounter = (fallbackSnapshotCounter + 1) % 1_000_000;
	return `${prefix}:fallback:${fallbackSnapshotCounter}`;
}

function createSnapshotKey(value: unknown): string {
	if (isPromiseLike(value)) {
		return getDeferredSnapshotKey(value);
	}

	try {
		return `resolved:${JSON.stringify(value)}`;
	} catch {
		return generateDeferredSnapshotId('resolved:fallback');
	}
}

function createCompositeSnapshotKey(parts: Record<string, unknown>): string {
	return createSnapshotKey(
		Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, createSnapshotKey(value)]))
	);
}

function isHydratableItems(value: unknown): value is unknown[] | Promise<unknown[]> {
	return Array.isArray(value) || isPromiseLike<unknown[]>(value);
}

function createCalendarAssignmentsItems(
	assignmentTypes: AssignmentType[] | Promise<AssignmentType[]>,
	assignmentEntries: DailyAssignment[] | Promise<DailyAssignment[]>
) {
	if (isPromiseLike(assignmentTypes) || isPromiseLike(assignmentEntries)) {
		return Promise.all([assignmentTypes, assignmentEntries]).then(([types, assignments]) => ({
			types,
			assignments
		}));
	}

	return {
		types: assignmentTypes,
		assignments: assignmentEntries
	};
}

function createCalendarAssignmentsTarget(
	assignmentTypes: AssignmentType[] | Promise<AssignmentType[]>,
	assignmentEntries: DailyAssignment[] | Promise<DailyAssignment[]>,
	mode: 'replace' | 'merge' = 'replace',
	range?: { rangeStart?: string; rangeEnd?: string }
) {
	const items = createCalendarAssignmentsItems(assignmentTypes, assignmentEntries);
	const rangeStart = range?.rangeStart;
	const rangeEnd = range?.rangeEnd;

	return {
		mode,
		deferred: isPromiseLike(items),
		snapshotKey: createCompositeSnapshotKey({
			assignmentTypes,
			assignmentEntries,
			rangeStart: rangeStart ?? null,
			rangeEnd: rangeEnd ?? null
		}),
		rangeStart,
		rangeEnd,
		items
	};
}

function createHydrationTarget<T>(items: HydrationItems<T>, mode: 'replace' | 'merge' = 'replace') {
	return {
		mode,
		deferred: isPromiseLike(items),
		snapshotKey: createSnapshotKey(items),
		items
	};
}

interface PlanFieldDescriptor {
	detect(d: Record<string, unknown>, workspace: WorkspaceKey): boolean;
	build(d: Record<string, unknown>, workspace: WorkspaceKey, plan: HydrationPlan): void;
}

function getDateRangeHydrationMode(workspace: WorkspaceKey): 'replace' | 'merge' {
	return workspace === 'calendar' ? 'merge' : 'replace';
}

function getCalendarAssignmentEntries(
	d: Record<string, unknown>,
	workspace: WorkspaceKey
): DailyAssignment[] | Promise<DailyAssignment[]> | undefined {
	if (isHydratableItems(d.dailyAssignments)) {
		return d.dailyAssignments as DailyAssignment[] | Promise<DailyAssignment[]>;
	}

	if (workspace === 'dashboard' && isHydratableItems(d.todayAssignments)) {
		return d.todayAssignments as DailyAssignment[] | Promise<DailyAssignment[]>;
	}

	return undefined;
}

function simpleField<T>(
	dataKey: string,
	assign: (plan: HydrationPlan, target: HydrationTarget<T>) => void,
	options: { dateRangeMode?: boolean } = {}
): PlanFieldDescriptor {
	return {
		detect: (d) => isHydratableItems(d[dataKey]),
		build: (d, workspace, plan) => {
			assign(
				plan,
				createHydrationTarget(
					d[dataKey] as HydrationItems<T>,
					options.dateRangeMode ? getDateRangeHydrationMode(workspace) : 'replace'
				)
			);
		}
	};
}

const PLAN_FIELDS: PlanFieldDescriptor[] = [
	{
		detect: (d) => isHydratableItems(d.personnel) || isHydratableItems(d.allPersonnel),
		build: (d, _workspace, plan) => {
			const scoped = isHydratableItems(d.personnel) ? d.personnel : [];
			plan.personnel = {
				scoped: createHydrationTarget(scoped),
				// `all` is only set when explicit all-org data was provided.
				// Falling back to `personnel` would silently hydrate allPersonnelStore
				// with scoped-only data once that store exists.
				...(isHydratableItems(d.allPersonnel) && {
					all: createHydrationTarget(d.allPersonnel)
				})
			};
		}
	},
	simpleField('groups', (plan, target) => {
		plan.groups = target;
	}),
	simpleField('statusTypes', (plan, target) => {
		plan.statusTypes = target;
	}),
	simpleField<AvailabilityEntry>(
		'availabilityEntries',
		(plan, target) => {
			plan.availabilityEntries = target;
		},
		{ dateRangeMode: true }
	),
	simpleField<SpecialDay>(
		'specialDays',
		(plan, target) => {
			plan.specialDays = target;
		},
		{ dateRangeMode: true }
	),
	{
		detect: (d, workspace) => {
			const assignmentEntries = getCalendarAssignmentEntries(d, workspace);
			return isHydratableItems(d.assignmentTypes) && isHydratableItems(assignmentEntries);
		},
		build: (d, workspace, plan) => {
			const assignmentEntries = getCalendarAssignmentEntries(d, workspace);
			if (!isHydratableItems(d.assignmentTypes) || !isHydratableItems(assignmentEntries)) return;

			plan.calendarAssignments = createCalendarAssignmentsTarget(
				d.assignmentTypes as AssignmentType[] | Promise<AssignmentType[]>,
				assignmentEntries,
				getDateRangeHydrationMode(workspace),
				{
					rangeStart: typeof d.rangeStart === 'string' ? d.rangeStart : undefined,
					rangeEnd: typeof d.rangeEnd === 'string' ? d.rangeEnd : undefined
				}
			);
		}
	},
	simpleField('trainingTypes', (plan, target) => {
		plan.trainingTypes = target;
	}),
	simpleField('trainingViews', (plan, target) => {
		plan.trainingViews = target;
	}),
	simpleField<PersonnelTraining>('personnelTrainings', (plan, target) => {
		plan.personnelTrainings = target;
	}),
	simpleField<IctTask>('ictTasks', (plan, target) => {
		plan.ictTasks = target;
	}),
	simpleField<PersonnelIctCompletion>('personnelIctCompletions', (plan, target) => {
		plan.personnelIctCompletions = target;
	}),
	simpleField<string>('pinnedGroups', (plan, target) => {
		plan.pinnedGroups = target;
	}),
	{
		// Dashboard rating-scheme data is a summary-shaped subset, not the canonical store dataset.
		detect: (d, workspace) => workspace !== 'dashboard' && isHydratableItems(d.ratingSchemeEntries),
		build: (d, _workspace, plan) => {
			plan.ratingSchemeEntries = createHydrationTarget(d.ratingSchemeEntries as HydrationItems<RatingSchemeEntry>);
		}
	},
	{
		detect: (d) => Array.isArray(d.onboardingTemplates) || Array.isArray(d.onboardingTemplateSteps),
		build: (d, _workspace, plan) => {
			plan.onboardingTemplates = {
				mode: 'replace',
				snapshotKey: createSnapshotKey({
					onboardingTemplates: d.onboardingTemplates ?? [],
					onboardingTemplateSteps: d.onboardingTemplateSteps ?? []
				}),
				templates: (d.onboardingTemplates as OnboardingTemplate[]) ?? [],
				steps: (d.onboardingTemplateSteps as OnboardingTemplateStep[]) ?? []
			};
		}
	},
	{
		// Dashboard exposes active onboardings for its widgets, but that should not replace the
		// shared onboarding store, which owns active + completed/cancelled records.
		detect: (d) => isHydratableItems(d.onboardings),
		build: (d, _workspace, plan) => {
			plan.onboardings = createHydrationTarget(d.onboardings as HydrationItems<PersonnelOnboarding>);
		}
	}
];

/**
 * Production `HydrationPlannerPort` implementation.
 *
 * Pure function — inspects raw workspace data for the shared reference fields
 * (`personnel`, `allPersonnel`, `groups`, `statusTypes`, `trainingTypes`) and
 * returns a typed `HydrationPlan`. Returns `undefined` when none of those fields
 * are present so callers can skip hydration entirely.
 */
export function createDefaultHydrationPlanner(orgId: string): HydrationPlannerPort {
	return {
		createPlan(workspace: WorkspaceKey, data: unknown): HydrationPlan | undefined {
			if (data == null || typeof data !== 'object' || Array.isArray(data)) return undefined;
			const d = data as Record<string, unknown>;

			const presentFields = PLAN_FIELDS.filter((field) => field.detect(d, workspace));
			if (presentFields.length === 0) return undefined;

			const plan: HydrationPlan = { orgId };
			for (const field of presentFields) {
				field.build(d, workspace, plan);
			}

			return plan;
		}
	};
}
