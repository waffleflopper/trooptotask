import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { OrganizationMemberPermissions } from '$lib/types';
import type { ClientAffordance, OrgContext } from '$lib/stores/orgContext.svelte';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { RatingSchemeEntry, WorkflowStatus } from '$features/rating-scheme/rating-scheme.types';
import { getRatingDueStatus } from '$features/rating-scheme/utils/ratingScheme';

export interface RatingSchemePageData {
	orgId: string;
	orgName: string;
	permissions?: OrganizationMemberPermissions | null;
	ratingSchemeEntries: RatingSchemeEntry[];
	lossWarningWindowDays?: number;
	[key: string]: unknown;
}

export interface RatingSchemeStoreAccessor {
	readonly items: RatingSchemeEntry[];
}

export class RatingSchemePageContext {
	ratingViewMode = $state<'grouped' | 'table'>('grouped');
	ratingFilter = $state<'active' | 'completed' | 'change-of-rater' | 'all'>('active');
	evalTypeFilter = $state<'all' | 'OER' | 'NCOER' | 'WOER'>('all');
	workflowFilter = $state<WorkflowStatus | 'all'>('all');

	readonly #data: RatingSchemePageData;
	readonly #modals: ModalRegistry;
	readonly #org: OrgContext;
	readonly #ratingStore: RatingSchemeStoreAccessor;

	constructor(
		data: RatingSchemePageData,
		modals: ModalRegistry,
		org: OrgContext,
		ratingStore: RatingSchemeStoreAccessor | RatingSchemeEntry[] = []
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

	get ratingSchemeWriteAffordance(): ClientAffordance {
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
		return entries;
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

	handleAddRatingEntry(): void {
		this.#modals.open('rating-modal', { entry: null });
	}

	handleEditRatingEntry(entry: RatingSchemeEntry): void {
		this.#modals.open('rating-modal', { entry });
	}
}
