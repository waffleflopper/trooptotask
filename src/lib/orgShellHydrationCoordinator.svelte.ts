import { SvelteMap } from 'svelte/reactivity';
import { onboardingTemplateStore } from '$features/onboarding/stores/onboardingTemplate.svelte';
import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';
import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { mergeById } from '$lib/utils/mergeById';
import type {
	CalendarAssignmentsHydrationItems,
	CalendarAssignmentsHydrationTarget,
	HydrationPlan,
	HydrationTarget,
	OnboardingTemplatesHydrationTarget
} from '$lib/server/core/orgShell';
import type {
	CalendarAssignmentsLoadable,
	HydrationStores,
	Loadable,
	OnboardingTemplatesLoadable,
	OrgShellHydrator
} from '$lib/orgShellCoordinator';
export type { HydrationStores } from '$lib/orgShellCoordinator';

const defaultStores: HydrationStores = {
	personnelStore: rosterStore,
	groupsStore,
	statusTypesStore,
	availabilityEntriesStore: availabilityStore,
	specialDaysStore,
	calendarAssignmentsStore: dailyAssignmentsStore,
	trainingTypesStore,
	trainingViewsStore,
	personnelTrainingsStore,
	ictTasksStore,
	personnelIctCompletionsStore,
	pinnedGroupsStore,
	ratingSchemeStore,
	onboardingTemplateStore,
	onboardingStore
};

interface TargetSnapshotState {
	orgId: string;
	snapshotKey: string;
}

type OnboardingTemplatesResolved = Pick<OnboardingTemplatesHydrationTarget, 'templates' | 'steps'>;

interface HydrationTargetDescriptor {
	targetName: string;
	snapshotKey: string;
	items: unknown | Promise<unknown>;
	storeOrgId(): string;
	startLoading?(): void;
	apply(resolved: unknown): void;
}

function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

function hasStringId(value: unknown): value is { id: string } {
	return !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string';
}

function canMergeById<T>(items: readonly T[]): items is Array<T & { id: string }> {
	return items.every(hasStringId);
}

function mergeLoadItems<T>(store: Loadable<T>, items: T[], orgId: string, mode: HydrationTarget['mode']): T[] {
	const existingItems = store.items ?? [];
	if (mode !== 'merge' || store.orgId !== orgId || !canMergeById(existingItems) || !canMergeById(items)) {
		return items;
	}

	return mergeById(existingItems, items);
}

function mergeCalendarAssignments(
	store: CalendarAssignmentsLoadable,
	items: CalendarAssignmentsHydrationItems,
	orgId: string,
	target: CalendarAssignmentsHydrationTarget
): CalendarAssignmentsHydrationItems {
	if (target.mode !== 'merge' || store.orgId !== orgId) {
		return items;
	}

	const existingAssignments = store.assignments ?? [];
	const assignments =
		target.rangeStart && target.rangeEnd
			? mergeById(
					existingAssignments.filter(
						(assignment) => assignment.date < target.rangeStart! || assignment.date > target.rangeEnd!
					),
					items.assignments
				)
			: mergeById(existingAssignments, items.assignments);

	return {
		types: items.types,
		assignments
	};
}

export type OrgShellHydrationCoordinator = OrgShellHydrator;

export function createOrgShellHydrationCoordinator(): OrgShellHydrationCoordinator {
	const appliedSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();
	const pendingSnapshotKeys = new SvelteMap<string, TargetSnapshotState>();

	async function applyDescriptor(descriptor: HydrationTargetDescriptor, orgId: string): Promise<void> {
		const { targetName, snapshotKey } = descriptor;

		const appliedState = appliedSnapshotKeys.get(targetName);
		if (
			descriptor.storeOrgId() === orgId &&
			appliedState?.orgId === orgId &&
			appliedState.snapshotKey === snapshotKey
		) {
			return;
		}

		const pendingState = pendingSnapshotKeys.get(targetName);
		if (pendingState?.orgId === orgId && pendingState.snapshotKey === snapshotKey) return;

		pendingSnapshotKeys.set(targetName, { orgId, snapshotKey });

		if (isPromiseLike<unknown>(descriptor.items)) {
			descriptor.startLoading?.();
			try {
				const items = await descriptor.items;
				const latestPending = pendingSnapshotKeys.get(targetName);
				if (latestPending?.orgId !== orgId || latestPending.snapshotKey !== snapshotKey) return;
				descriptor.apply(items);
				pendingSnapshotKeys.delete(targetName);
				appliedSnapshotKeys.set(targetName, { orgId, snapshotKey });
				return;
			} catch (error) {
				const latestPending = pendingSnapshotKeys.get(targetName);
				if (latestPending?.orgId === orgId && latestPending.snapshotKey === snapshotKey) {
					pendingSnapshotKeys.delete(targetName);
				}
				console.error(`[hydration] Failed to load ${targetName} for org ${orgId}`, error);
				throw error;
			}
		}

		descriptor.apply(descriptor.items);
		pendingSnapshotKeys.delete(targetName);
		appliedSnapshotKeys.set(targetName, { orgId, snapshotKey });
	}

	function createTargetDescriptor<T>(
		target: HydrationTarget | undefined,
		store: Loadable<T>,
		orgId: string,
		targetName: string
	): HydrationTargetDescriptor | undefined {
		if (!target || target.mode === 'preserve-client') return undefined;

		return {
			targetName,
			snapshotKey: target.snapshotKey,
			items: target.items as T[] | Promise<T[]>,
			storeOrgId: () => store.orgId,
			startLoading: store.startLoading ? () => store.startLoading?.() : undefined,
			apply: (items) => store.load(mergeLoadItems(store, items as T[], orgId, target.mode), orgId)
		};
	}

	function createCalendarAssignmentsDescriptor(
		target: CalendarAssignmentsHydrationTarget | undefined,
		store: CalendarAssignmentsLoadable,
		orgId: string,
		targetName: string
	): HydrationTargetDescriptor | undefined {
		if (!target || target.mode === 'preserve-client') return undefined;

		return {
			targetName,
			snapshotKey: target.snapshotKey,
			items: target.items,
			storeOrgId: () => store.orgId,
			startLoading: store.startLoading ? () => store.startLoading?.() : undefined,
			apply: (items) => {
				const mergedItems = mergeCalendarAssignments(store, items as CalendarAssignmentsHydrationItems, orgId, target);
				store.load(mergedItems.types, mergedItems.assignments, orgId);
			}
		};
	}

	function createOnboardingTemplatesDescriptor(
		target: OnboardingTemplatesHydrationTarget | undefined,
		store: OnboardingTemplatesLoadable,
		orgId: string,
		targetName: string
	): HydrationTargetDescriptor | undefined {
		if (!target || target.mode === 'preserve-client') return undefined;

		return {
			targetName,
			snapshotKey: target.snapshotKey,
			items: { templates: target.templates, steps: target.steps },
			storeOrgId: () => store.orgId,
			apply: (items) => {
				const { templates, steps } = items as OnboardingTemplatesResolved;
				store.load(templates, steps, orgId);
			}
		};
	}

	return {
		reset() {
			appliedSnapshotKeys.clear();
			pendingSnapshotKeys.clear();
		},

		async hydrate(plan?: HydrationPlan, stores: HydrationStores = defaultStores): Promise<void> {
			if (!plan) return;
			const { orgId } = plan;

			const descriptors = [
				createTargetDescriptor(plan.personnel?.scoped, stores.personnelStore, orgId, 'personnel.scoped'),
				// plan.personnel.all: no allPersonnelStore yet — forward-looking slot in HydrationPlan
				createTargetDescriptor(plan.groups, stores.groupsStore, orgId, 'groups'),
				createTargetDescriptor(plan.statusTypes, stores.statusTypesStore, orgId, 'statusTypes'),
				createTargetDescriptor(plan.availabilityEntries, stores.availabilityEntriesStore, orgId, 'availabilityEntries'),
				createTargetDescriptor(plan.specialDays, stores.specialDaysStore, orgId, 'specialDays'),
				createCalendarAssignmentsDescriptor(
					plan.calendarAssignments,
					stores.calendarAssignmentsStore,
					orgId,
					'calendarAssignments'
				),
				createTargetDescriptor(plan.trainingTypes, stores.trainingTypesStore, orgId, 'trainingTypes'),
				createTargetDescriptor(plan.trainingViews, stores.trainingViewsStore, orgId, 'trainingViews'),
				createTargetDescriptor(plan.personnelTrainings, stores.personnelTrainingsStore, orgId, 'personnelTrainings'),
				createTargetDescriptor(plan.ictTasks, stores.ictTasksStore, orgId, 'ictTasks'),
				createTargetDescriptor(
					plan.personnelIctCompletions,
					stores.personnelIctCompletionsStore,
					orgId,
					'personnelIctCompletions'
				),
				createTargetDescriptor(plan.pinnedGroups, stores.pinnedGroupsStore, orgId, 'pinnedGroups'),
				createTargetDescriptor(plan.ratingSchemeEntries, stores.ratingSchemeStore, orgId, 'ratingSchemeEntries'),
				createOnboardingTemplatesDescriptor(
					plan.onboardingTemplates,
					stores.onboardingTemplateStore,
					orgId,
					'onboardingTemplates'
				),
				createTargetDescriptor(plan.onboardings, stores.onboardingStore, orgId, 'onboardings')
			].filter((descriptor): descriptor is HydrationTargetDescriptor => descriptor !== undefined);

			await Promise.all(descriptors.map((descriptor) => applyDescriptor(descriptor, orgId)));
		}
	};
}

export const orgShellHydrationCoordinator = createOrgShellHydrationCoordinator();
