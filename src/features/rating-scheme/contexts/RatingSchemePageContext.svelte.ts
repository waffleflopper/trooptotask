import type { PersonnelLookup } from '$features/personnel/contracts';
import type { GroupedSort } from '../utils/ratingSchemeGroups';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { RatingSchemeAffordance, RatingSchemePageAccess } from '../contracts';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { RatingSchemeEntry, WorkflowStatus } from '$features/rating-scheme/rating-scheme.types';
import { ratingDueCounts } from '$features/rating-scheme/utils/ratingScheme';
import { isEvaluationCompleted } from '$features/rating-scheme/utils/evaluationWorkflow';
import { ratingSchemeEntries } from '../stores/ratingScheme.svelte';
import { isOnTracker } from '../utils/ratingSchemeEntries';
import { createChainSearch } from '../utils/ratingSchemeSearch';

export type RatingSchemeListingFilter = 'on-scheme' | 'archived' | 'all';

export interface RatingSchemePageData {
	orgId: string;
	orgName: string;
	personnelLookup: PersonnelLookup[];
	[key: string]: unknown;
}

export interface RatingSchemeStoreAccessor {
	readonly items: RatingSchemeEntry[];
}

export class RatingSchemePageContext {
	ratingViewMode = $state<'grouped' | 'table'>('grouped');
	groupedSort = $state<GroupedSort>('urgency');
	searchQuery = $state('');
	ratingFilter = $state<RatingSchemeListingFilter>('on-scheme');
	evalTypeFilter = $state<'all' | 'OER' | 'NCOER' | 'WOER'>('all');
	workflowFilter = $state<WorkflowStatus | 'all'>('all');

	readonly #data: RatingSchemePageData;
	readonly #modals: ModalRegistry;
	readonly #org: RatingSchemePageAccess;
	readonly #ratingStore: RatingSchemeStoreAccessor;

	constructor(
		data: RatingSchemePageData,
		modals: ModalRegistry,
		org: RatingSchemePageAccess,
		ratingStore: RatingSchemeStoreAccessor | RatingSchemeEntry[] = ratingSchemeEntries
	) {
		this.#data = data;
		this.#modals = modals;
		this.#org = org;
		this.#ratingStore = Array.isArray(ratingStore)
			? {
					get items() {
						return ratingStore as RatingSchemeEntry[];
					}
				}
			: ratingStore;
	}

	get data(): RatingSchemePageData {
		return this.#data;
	}

	get orgId(): string {
		return this.#data.orgId;
	}

	get orgName(): string {
		return this.#data.orgName;
	}

	get canManageConfig(): boolean {
		return this.#org.affordanceForGovernanceAction(POLICY_ACTION_CATALOG.organization.deleteRatingSchemeEntry).visible;
	}

	get canViewRatingScheme(): boolean {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.ratingScheme.viewEntries, { kind: 'unscoped' })
			.visible;
	}

	get showRatingSchemeWriteActions(): boolean {
		return this.ratingSchemeWriteAffordance.visible;
	}

	get canUseRatingSchemeWriteActions(): boolean {
		return this.ratingSchemeWriteAffordance.allowed;
	}

	get ratingSchemeWriteAffordance(): RatingSchemeAffordance {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.ratingScheme.updateEntries, { kind: 'unscoped' });
	}

	get hasAnyWorkflowStatus(): boolean {
		return this.#ratingStore.items.some((entry) => !!entry.workflowStatus);
	}

	get filteredRatingEntries(): RatingSchemeEntry[] {
		let entries = this.#ratingStore.items;
		if (this.ratingFilter !== 'all') {
			const onTracker = this.ratingFilter === 'on-scheme';
			entries = entries.filter((entry) => isOnTracker(entry) === onTracker);
		}
		if (this.evalTypeFilter !== 'all') entries = entries.filter((entry) => entry.evalType === this.evalTypeFilter);
		if (this.workflowFilter !== 'all') {
			entries = entries.filter((entry) => entry.workflowStatus === this.workflowFilter);
		}
		if (this.searchQuery.trim()) {
			entries = entries.filter(createChainSearch(this.searchQuery, this.#data.personnelLookup));
		}
		return entries;
	}

	get hasActiveSearchOrFilters(): boolean {
		return (
			!!this.searchQuery.trim() ||
			this.ratingFilter !== 'on-scheme' ||
			this.evalTypeFilter !== 'all' ||
			this.workflowFilter !== 'all'
		);
	}

	clearSearchAndFilters(): void {
		this.searchQuery = '';
		this.ratingFilter = 'on-scheme';
		this.evalTypeFilter = 'all';
		this.workflowFilter = 'all';
	}

	get totalEntryCount(): number {
		return this.#ratingStore.items.length;
	}

	get activeEntryCount(): number {
		return this.#ratingStore.items.filter((entry) => isOnTracker(entry) && !isEvaluationCompleted(entry.workflowStatus))
			.length;
	}

	get ratingStats(): { overdue: number; 'due-30': number; 'due-60': number } {
		return ratingDueCounts(this.#ratingStore.items);
	}

	get ratingModalOpen(): boolean {
		return this.#modals.isOpen('rating-modal');
	}

	get editingRatingEntryId(): string | null {
		return this.#modals.payload<{ entry: RatingSchemeEntry | null }>('rating-modal')?.entry?.id ?? null;
	}

	handleAddRatingEntry(): void {
		this.#modals.open('rating-modal', { entry: null });
	}

	handleEditRatingEntry(entry: RatingSchemeEntry): void {
		this.#modals.open('rating-modal', { entry });
	}
}
