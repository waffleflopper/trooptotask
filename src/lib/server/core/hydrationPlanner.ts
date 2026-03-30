import type { HydrationPlan, HydrationPlannerPort, WorkspaceKey } from './orgShell';

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

			const hasPersonnel = d.personnel != null || d.allPersonnel != null;
			const hasGroups = d.groups != null;
			const hasStatusTypes = d.statusTypes != null;
			const hasTrainingTypes = d.trainingTypes != null;

			if (!hasPersonnel && !hasGroups && !hasStatusTypes && !hasTrainingTypes) {
				return undefined;
			}

			const plan: HydrationPlan = { orgId };

			if (hasPersonnel) {
				const scoped = (d.personnel ?? []) as unknown[];
				plan.personnel = {
					scoped: { mode: 'replace', items: scoped },
					// `all` is only set when explicit all-org data was provided.
					// Falling back to `personnel` would silently hydrate allPersonnelStore
					// with scoped-only data once that store exists.
					...(d.allPersonnel != null && {
						all: { mode: 'replace', items: d.allPersonnel as unknown[] }
					})
				};
			}

			if (hasGroups) {
				plan.groups = { mode: 'replace', items: d.groups as unknown[] };
			}

			if (hasStatusTypes) {
				plan.statusTypes = { mode: 'replace', items: d.statusTypes as unknown[] };
			}

			if (hasTrainingTypes) {
				plan.trainingTypes = { mode: 'replace', items: d.trainingTypes as unknown[] };
			}

			return plan;
		}
	};
}
