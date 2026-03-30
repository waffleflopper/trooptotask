import type { HydrationPlan, HydrationPlannerPort, WorkspaceKey } from './orgShell';

const deferredSnapshotKeys = new WeakMap<object, string>();
let deferredSnapshotCounter = 0;

function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

function getDeferredSnapshotKey(value: object): string {
	let key = deferredSnapshotKeys.get(value);
	if (!key) {
		deferredSnapshotCounter += 1;
		key = `deferred:${deferredSnapshotCounter}`;
		deferredSnapshotKeys.set(value, key);
	}
	return key;
}

function createSnapshotKey(value: unknown): string {
	if (isPromiseLike(value)) {
		return getDeferredSnapshotKey(value);
	}

	try {
		return `resolved:${JSON.stringify(value)}`;
	} catch {
		deferredSnapshotCounter += 1;
		return `resolved:fallback:${deferredSnapshotCounter}`;
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
			const hasTrainingTypes = isHydratableItems(d.trainingTypes);

			if (!hasPersonnel && !hasGroups && !hasStatusTypes && !hasTrainingTypes) {
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

			if (hasTrainingTypes) {
				plan.trainingTypes = {
					mode: 'replace',
					snapshotKey: createSnapshotKey(d.trainingTypes),
					items: d.trainingTypes as unknown[] | Promise<unknown[]>
				};
			}

			return plan;
		}
	};
}
