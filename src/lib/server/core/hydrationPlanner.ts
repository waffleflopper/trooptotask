import type { HydrationItems, HydrationPlan, HydrationPlannerPort, WorkspaceKey } from './orgShell';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import type { PersonnelTraining } from '$features/training/training.types';
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

function createHydrationTarget<T>(items: HydrationItems<T>) {
	return {
		mode: 'replace' as const,
		deferred: isPromiseLike(items),
		snapshotKey: createSnapshotKey(items),
		items
	};
}

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

			const hasPersonnel = isHydratableItems(d.personnel) || isHydratableItems(d.allPersonnel);
			const hasGroups = isHydratableItems(d.groups);
			const hasStatusTypes = isHydratableItems(d.statusTypes);
			const hasAvailabilityEntries = isHydratableItems(d.availabilityEntries);
			const hasSpecialDays = isHydratableItems(d.specialDays);
			const assignmentEntries = isHydratableItems(d.dailyAssignments)
				? d.dailyAssignments
				: workspace === 'dashboard' && isHydratableItems(d.todayAssignments)
					? d.todayAssignments
					: undefined;
			const hasCalendarAssignments = isHydratableItems(d.assignmentTypes) && isHydratableItems(assignmentEntries);
			const hasTrainingTypes = isHydratableItems(d.trainingTypes);
			const hasTrainingViews = isHydratableItems(d.trainingViews);
			const hasPersonnelTrainings = isHydratableItems(d.personnelTrainings);
			const hasPinnedGroups = isHydratableItems(d.pinnedGroups);
			// Dashboard rating-scheme data is a summary-shaped subset, not the canonical store dataset.
			const hasRatingSchemeEntries = workspace !== 'dashboard' && isHydratableItems(d.ratingSchemeEntries);
			const hasOnboardingTemplates = Array.isArray(d.onboardingTemplates) || Array.isArray(d.onboardingTemplateSteps);
			// Dashboard exposes active onboardings for its widgets, but that should not replace the
			// shared onboarding store, which owns active + completed/cancelled records.
			const onboardingEntries = isHydratableItems(d.onboardings) ? d.onboardings : undefined;
			const hasOnboardings = isHydratableItems(onboardingEntries);

			if (
				!hasPersonnel &&
				!hasGroups &&
				!hasStatusTypes &&
				!hasAvailabilityEntries &&
				!hasSpecialDays &&
				!hasCalendarAssignments &&
				!hasTrainingTypes &&
				!hasTrainingViews &&
				!hasPersonnelTrainings &&
				!hasPinnedGroups &&
				!hasRatingSchemeEntries &&
				!hasOnboardingTemplates &&
				!hasOnboardings
			) {
				return undefined;
			}

			const plan: HydrationPlan = { orgId };

			if (hasPersonnel) {
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

			if (hasGroups) {
				plan.groups = createHydrationTarget(d.groups as unknown[] | Promise<unknown[]>);
			}

			if (hasStatusTypes) {
				plan.statusTypes = createHydrationTarget(d.statusTypes as unknown[] | Promise<unknown[]>);
			}

			if (hasAvailabilityEntries) {
				plan.availabilityEntries = createHydrationTarget(d.availabilityEntries as HydrationItems<AvailabilityEntry>);
			}

			if (hasSpecialDays) {
				plan.specialDays = createHydrationTarget(d.specialDays as HydrationItems<SpecialDay>);
			}

			if (hasCalendarAssignments) {
				const items = createCalendarAssignmentsItems(
					d.assignmentTypes as AssignmentType[] | Promise<AssignmentType[]>,
					assignmentEntries as DailyAssignment[] | Promise<DailyAssignment[]>
				);
				plan.calendarAssignments = {
					mode: 'replace',
					deferred: isPromiseLike(items),
					snapshotKey: createSnapshotKey(items),
					items
				};
			}

			if (hasTrainingTypes) {
				plan.trainingTypes = createHydrationTarget(d.trainingTypes as unknown[] | Promise<unknown[]>);
			}

			if (hasTrainingViews) {
				plan.trainingViews = createHydrationTarget(d.trainingViews as unknown[] | Promise<unknown[]>);
			}

			if (hasPersonnelTrainings) {
				plan.personnelTrainings = createHydrationTarget(d.personnelTrainings as HydrationItems<PersonnelTraining>);
			}

			if (hasPinnedGroups) {
				plan.pinnedGroups = createHydrationTarget(d.pinnedGroups as HydrationItems<string>);
			}

			if (hasRatingSchemeEntries) {
				plan.ratingSchemeEntries = createHydrationTarget(d.ratingSchemeEntries as HydrationItems<RatingSchemeEntry>);
			}

			if (hasOnboardingTemplates) {
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

			if (hasOnboardings) {
				plan.onboardings = createHydrationTarget(onboardingEntries as HydrationItems<PersonnelOnboarding>);
			}

			return plan;
		}
	};
}
