/**
 * Client-side hydration applier for the org shell/workspace split (RFC #415).
 *
 * `applyHydration(plan?, stores?)` replaces per-layout `lastRefs` / promise-ref guards.
 * The server packages a `HydrationPlan` inside each `WorkspaceBootstrap` and workspace
 * layouts call `applyHydration(data.<workspace>.hydration)` in a `$effect`.
 *
 * Modes:
 *   replace        → store.load(items, orgId)   — new server state, mutation log replayed
 *   merge          → store.load(items, orgId)   — same as replace (mutation log preserved)
 *   preserve-client → no-op                     — keeps current client/optimistic state
 *
 * The optional `stores` parameter is the injection point for tests; production callers
 * rely on the default binding to the real module-level singletons.
 */
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import type { PersonnelTraining, TrainingType, TrainingView } from '$features/training/training.types';
import { onboardingTemplateStore } from '$features/onboarding/stores/onboardingTemplate.svelte';
import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';
import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import type {
	CalendarAssignmentsHydrationTarget,
	HydrationPlan,
	HydrationTarget,
	OnboardingTemplatesHydrationTarget
} from '$lib/server/core/orgShell';

// Structural type — only the load method is needed; avoids coupling to full Store<T>.
interface Loadable<T> {
	readonly orgId: string;
	load(items: T[], orgId: string): void;
	startLoading?(): void;
}

interface CalendarAssignmentsLoadable {
	readonly orgId: string;
	load(types: AssignmentType[], assignments: DailyAssignment[], orgId: string): void;
}

interface OnboardingTemplatesLoadable {
	readonly orgId: string;
	load(templates: OnboardingTemplate[], steps: OnboardingTemplateStep[], orgId: string): void;
}

export interface HydrationStores {
	personnelStore: Loadable<Personnel>;
	groupsStore: Loadable<Group>;
	statusTypesStore: Loadable<StatusType>;
	availabilityEntriesStore: Loadable<AvailabilityEntry>;
	specialDaysStore: Loadable<SpecialDay>;
	calendarAssignmentsStore: CalendarAssignmentsLoadable;
	trainingTypesStore: Loadable<TrainingType>;
	trainingViewsStore: Loadable<TrainingView>;
	personnelTrainingsStore: Loadable<PersonnelTraining>;
	pinnedGroupsStore: Loadable<string>;
	ratingSchemeStore: Loadable<RatingSchemeEntry>;
	onboardingTemplateStore: OnboardingTemplatesLoadable;
	onboardingStore: Loadable<PersonnelOnboarding>;
}

const defaultStores: HydrationStores = {
	personnelStore,
	groupsStore,
	statusTypesStore,
	availabilityEntriesStore: availabilityStore,
	specialDaysStore,
	calendarAssignmentsStore: dailyAssignmentsStore,
	trainingTypesStore,
	trainingViewsStore,
	personnelTrainingsStore,
	pinnedGroupsStore,
	ratingSchemeStore,
	onboardingTemplateStore,
	onboardingStore
};

interface TargetSnapshotState {
	orgId: string;
	snapshotKey: string;
}

const appliedSnapshotKeys = new Map<string, TargetSnapshotState>();
const pendingSnapshotKeys = new Map<string, TargetSnapshotState>();

function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

async function applyTarget<T>(
	target: HydrationTarget | undefined,
	store: Loadable<T>,
	orgId: string,
	targetName: string
): Promise<void> {
	if (!target || target.mode === 'preserve-client') return;

	const appliedState = appliedSnapshotKeys.get(targetName);
	if (store.orgId === orgId && appliedState?.orgId === orgId && appliedState.snapshotKey === target.snapshotKey) {
		return;
	}

	const pendingState = pendingSnapshotKeys.get(targetName);
	if (pendingState?.orgId === orgId && pendingState.snapshotKey === target.snapshotKey) return;

	pendingSnapshotKeys.set(targetName, { orgId, snapshotKey: target.snapshotKey });

	if (isPromiseLike<T[]>(target.items)) {
		store.startLoading?.();
		try {
			const items = await target.items;
			const latestPending = pendingSnapshotKeys.get(targetName);
			if (latestPending?.orgId !== orgId || latestPending.snapshotKey !== target.snapshotKey) return;
			store.load(items, orgId);
			pendingSnapshotKeys.delete(targetName);
			appliedSnapshotKeys.set(targetName, { orgId, snapshotKey: target.snapshotKey });
			return;
		} catch (error) {
			pendingSnapshotKeys.delete(targetName);
			console.error(`[hydration] Failed to load ${targetName} for org ${orgId}`, error);
			throw error;
		}
	}

	store.load(target.items as T[], orgId);
	pendingSnapshotKeys.delete(targetName);
	appliedSnapshotKeys.set(targetName, { orgId, snapshotKey: target.snapshotKey });
}

function applyCalendarAssignmentsTarget(
	target: CalendarAssignmentsHydrationTarget | undefined,
	store: CalendarAssignmentsLoadable,
	orgId: string,
	targetName: string
): void {
	if (!target || target.mode === 'preserve-client') return;

	const appliedState = appliedSnapshotKeys.get(targetName);
	if (store.orgId === orgId && appliedState?.orgId === orgId && appliedState.snapshotKey === target.snapshotKey) {
		return;
	}

	const pendingState = pendingSnapshotKeys.get(targetName);
	if (pendingState?.orgId === orgId && pendingState.snapshotKey === target.snapshotKey) return;

	pendingSnapshotKeys.set(targetName, { orgId, snapshotKey: target.snapshotKey });
	store.load(target.types, target.assignments, orgId);
	pendingSnapshotKeys.delete(targetName);
	appliedSnapshotKeys.set(targetName, { orgId, snapshotKey: target.snapshotKey });
}

function applyOnboardingTemplatesTarget(
	target: OnboardingTemplatesHydrationTarget | undefined,
	store: OnboardingTemplatesLoadable,
	orgId: string,
	targetName: string
): void {
	if (!target || target.mode === 'preserve-client') return;

	const appliedState = appliedSnapshotKeys.get(targetName);
	if (store.orgId === orgId && appliedState?.orgId === orgId && appliedState.snapshotKey === target.snapshotKey) {
		return;
	}

	const pendingState = pendingSnapshotKeys.get(targetName);
	if (pendingState?.orgId === orgId && pendingState.snapshotKey === target.snapshotKey) return;

	pendingSnapshotKeys.set(targetName, { orgId, snapshotKey: target.snapshotKey });
	store.load(target.templates, target.steps, orgId);
	pendingSnapshotKeys.delete(targetName);
	appliedSnapshotKeys.set(targetName, { orgId, snapshotKey: target.snapshotKey });
}

export function resetHydrationState(): void {
	appliedSnapshotKeys.clear();
	pendingSnapshotKeys.clear();
}

export async function applyHydration(plan?: HydrationPlan, stores: HydrationStores = defaultStores): Promise<void> {
	if (!plan) return;
	const { orgId } = plan;

	await Promise.all([
		applyTarget(plan.personnel?.scoped, stores.personnelStore, orgId, 'personnel.scoped'),
		// plan.personnel.all: no allPersonnelStore yet — forward-looking slot in HydrationPlan
		applyTarget(plan.groups, stores.groupsStore, orgId, 'groups'),
		applyTarget(plan.statusTypes, stores.statusTypesStore, orgId, 'statusTypes'),
		applyTarget(plan.availabilityEntries, stores.availabilityEntriesStore, orgId, 'availabilityEntries'),
		applyTarget(plan.specialDays, stores.specialDaysStore, orgId, 'specialDays'),
		Promise.resolve(
			applyCalendarAssignmentsTarget(
				plan.calendarAssignments,
				stores.calendarAssignmentsStore,
				orgId,
				'calendarAssignments'
			)
		),
		applyTarget(plan.trainingTypes, stores.trainingTypesStore, orgId, 'trainingTypes'),
		applyTarget(plan.trainingViews, stores.trainingViewsStore, orgId, 'trainingViews'),
		applyTarget(plan.personnelTrainings, stores.personnelTrainingsStore, orgId, 'personnelTrainings'),
		applyTarget(plan.pinnedGroups, stores.pinnedGroupsStore, orgId, 'pinnedGroups'),
		applyTarget(plan.ratingSchemeEntries, stores.ratingSchemeStore, orgId, 'ratingSchemeEntries'),
		Promise.resolve(
			applyOnboardingTemplatesTarget(
				plan.onboardingTemplates,
				stores.onboardingTemplateStore,
				orgId,
				'onboardingTemplates'
			)
		),
		applyTarget(plan.onboardings, stores.onboardingStore, orgId, 'onboardings')
	]);
}
