import type { HydrationItems, HydrationPlan, HydrationPlannerPort, WorkspaceKey } from './orgShell';
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
		createPlan(_workspace: WorkspaceKey, data: unknown): HydrationPlan | undefined {
			if (data == null || typeof data !== 'object' || Array.isArray(data)) return undefined;
			const d = data as Record<string, unknown>;

			const hasPersonnel = isHydratableItems(d.personnel) || isHydratableItems(d.allPersonnel);
			const hasGroups = isHydratableItems(d.groups);
			const hasStatusTypes = isHydratableItems(d.statusTypes);
			const hasAvailabilityEntries = isHydratableItems(d.availabilityEntries);
			const hasSpecialDays = isHydratableItems(d.specialDays);
			const hasCalendarAssignments = Array.isArray(d.assignmentTypes) && Array.isArray(d.dailyAssignments);
			const hasTrainingTypes = isHydratableItems(d.trainingTypes);
			const hasTrainingViews = isHydratableItems(d.trainingViews);
			const hasPersonnelTrainings = isHydratableItems(d.personnelTrainings);

			if (
				!hasPersonnel &&
				!hasGroups &&
				!hasStatusTypes &&
				!hasAvailabilityEntries &&
				!hasSpecialDays &&
				!hasCalendarAssignments &&
				!hasTrainingTypes &&
				!hasTrainingViews &&
				!hasPersonnelTrainings
			) {
				return undefined;
			}

			const plan: HydrationPlan = { orgId };

			if (hasPersonnel) {
				const scoped = isHydratableItems(d.personnel) ? d.personnel : [];
				plan.personnel = {
					scoped: {
						mode: 'replace',
						snapshotKey: createSnapshotKey(scoped),
						items: scoped
					},
					// `all` is only set when explicit all-org data was provided.
					// Falling back to `personnel` would silently hydrate allPersonnelStore
					// with scoped-only data once that store exists.
					...(isHydratableItems(d.allPersonnel) && {
						all: {
							mode: 'replace',
							snapshotKey: createSnapshotKey(d.allPersonnel),
							items: d.allPersonnel
						}
					})
				};
			}

			if (hasGroups) {
				plan.groups = {
					mode: 'replace',
					snapshotKey: createSnapshotKey(d.groups),
					items: d.groups as unknown[] | Promise<unknown[]>
				};
			}

			if (hasStatusTypes) {
				plan.statusTypes = {
					mode: 'replace',
					snapshotKey: createSnapshotKey(d.statusTypes),
					items: d.statusTypes as unknown[] | Promise<unknown[]>
				};
			}

			if (hasAvailabilityEntries) {
				plan.availabilityEntries = {
					mode: 'replace',
					snapshotKey: createSnapshotKey(d.availabilityEntries),
					items: d.availabilityEntries as HydrationItems<AvailabilityEntry>
				};
			}

			if (hasSpecialDays) {
				plan.specialDays = {
					mode: 'replace',
					snapshotKey: createSnapshotKey(d.specialDays),
					items: d.specialDays as HydrationItems<SpecialDay>
				};
			}

			if (hasCalendarAssignments) {
				plan.calendarAssignments = {
					mode: 'replace',
					snapshotKey: createSnapshotKey({
						assignmentTypes: d.assignmentTypes,
						dailyAssignments: d.dailyAssignments
					}),
					types: d.assignmentTypes as AssignmentType[],
					assignments: d.dailyAssignments as DailyAssignment[]
				};
			}

			if (hasTrainingTypes) {
				plan.trainingTypes = {
					mode: 'replace',
					snapshotKey: createSnapshotKey(d.trainingTypes),
					items: d.trainingTypes as unknown[] | Promise<unknown[]>
				};
			}

			if (hasTrainingViews) {
				plan.trainingViews = {
					mode: 'replace',
					snapshotKey: createSnapshotKey(d.trainingViews),
					items: d.trainingViews as unknown[] | Promise<unknown[]>
				};
			}

			if (hasPersonnelTrainings) {
				plan.personnelTrainings = {
					mode: 'replace',
					snapshotKey: createSnapshotKey(d.personnelTrainings),
					items: d.personnelTrainings as HydrationItems<PersonnelTraining>
				};
			}

			return plan;
		}
	};
}
