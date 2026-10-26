import type { PersonnelLookup } from '$features/personnel/contracts';
import type { GroupedSort } from '../utils/ratingSchemeGroups';
import { SvelteMap } from 'svelte/reactivity';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { RatingSchemeAffordance, RatingSchemePageAccess } from '../contracts';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { RatingSchemeEntry, WorkflowStatus } from '$features/rating-scheme/rating-scheme.types';
import { getRatingDueStatus } from '$features/rating-scheme/utils/ratingScheme';
import { ratingSchemeStore } from '../stores/ratingScheme.svelte';

export interface RatingSchemePageData {
	orgId: string;
	orgName: string;
	ratingSchemeEntries: RatingSchemeEntry[];
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
	ratingFilter = $state<'active' | 'completed' | 'change-of-rater' | 'all'>('active');
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
		ratingStore: RatingSchemeStoreAccessor | RatingSchemeEntry[] = ratingSchemeStore
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
		if (this.ratingFilter !== 'all') entries = entries.filter((entry) => entry.status === this.ratingFilter);
		if (this.evalTypeFilter !== 'all') entries = entries.filter((entry) => entry.evalType === this.evalTypeFilter);
		if (this.workflowFilter !== 'all') {
			entries = entries.filter((entry) => entry.workflowStatus === this.workflowFilter);
		}
		const query = this.searchQuery.trim().toLowerCase();
		if (query) {
			const people = new SvelteMap(
				this.#data.personnelLookup.map((person) => [
					person.id,
					`${person.rank} ${person.firstName} ${person.lastName}`.toLowerCase().includes(query) ||
						`${person.lastName}, ${person.firstName}`.toLowerCase().includes(query)
				])
			);
			const matchesPerson = (id: string | null, externalName: string | null = null): boolean => {
				if (!id) return !!externalName?.toLowerCase().includes(query);
				return people.get(id) ?? false;
			};
			entries = entries.filter(
				(entry) =>
					matchesPerson(entry.ratedPersonId) ||
					matchesPerson(entry.raterPersonId, entry.raterName) ||
					matchesPerson(entry.seniorRaterPersonId, entry.seniorRaterName) ||
					matchesPerson(entry.intermediateRaterPersonId, entry.intermediateRaterName) ||
					matchesPerson(entry.reviewerPersonId, entry.reviewerName)
			);
		}
		return entries;
	}

	get hasActiveSearchOrFilters(): boolean {
		return (
			!!this.searchQuery.trim() ||
			this.ratingFilter !== 'active' ||
			this.evalTypeFilter !== 'all' ||
			this.workflowFilter !== 'all'
		);
	}

	clearSearchAndFilters(): void {
		this.searchQuery = '';
		this.ratingFilter = 'active';
		this.evalTypeFilter = 'all';
		this.workflowFilter = 'all';
	}

	get totalEntryCount(): number {
		return this.#ratingStore.items.length;
	}

	get activeEntryCount(): number {
		return this.#ratingStore.items.filter((entry) => entry.status === 'active').length;
	}

	get ratingStats(): { overdue: number; 'due-30': number; 'due-60': number } {
		const counts = { overdue: 0, 'due-30': 0, 'due-60': 0 };
		for (const entry of this.#ratingStore.items) {
			const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status);
			if (status === 'overdue' || status === 'due-30' || status === 'due-60') {
				counts[status]++;
			}
		}
		return counts;
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
