import { SvelteSet } from 'svelte/reactivity';
import type { Personnel } from '$lib/types';
import type { RatingSchemeEntry, WorkflowStatus } from '$features/rating-scheme/rating-scheme.types';
import { groupAndSortPersonnel } from '$features/personnel/utils/personnelGrouping';
import type { PersonnelGroup } from '$features/personnel/utils/personnelGrouping';
import type { OrgContext } from '$lib/stores/orgContext.svelte';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

// ---------------------------------------------------------------------------
// Data shape expected from the page server / layout
// ---------------------------------------------------------------------------
export interface PersonnelPageData {
	orgId: string;
	orgName: string;
	pinnedGroups: string[];
	ratingSchemeEntries: RatingSchemeEntry[];
	personnel?: Personnel[];
	permissions?: {
		canViewPersonnel?: boolean;
		canEditPersonnel?: boolean;
		[key: string]: unknown;
	} | null;
	scopedGroupId?: string | null;
	[key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Reactive store accessors — injected so the context is testable without
// importing the real module-singleton stores.
// ---------------------------------------------------------------------------
export interface PersonnelStoreAccessor {
	readonly items: Personnel[];
}

export interface RatingStoreAccessor {
	readonly items: RatingSchemeEntry[];
}

export interface PinnedGroupsAccessor {
	readonly list: string[];
}

// ---------------------------------------------------------------------------
// Context class
// ---------------------------------------------------------------------------
export class PersonnelPageContext {
	// ---- Reactive state ----
	viewMode = $state<'alphabetical' | 'by-group'>('by-group');
	pageView = $state<'roster' | 'rating-scheme'>('roster');
	searchQuery = $state('');
	ratingViewMode = $state<'grouped' | 'table'>('grouped');
	ratingFilter = $state<'active' | 'completed' | 'change-of-rater' | 'all'>('active');
	evalTypeFilter = $state<'all' | 'OER' | 'NCOER' | 'WOER'>('all');
	workflowFilter = $state<WorkflowStatus | 'all'>('all');
	collapsedGroups = $state<SvelteSet<string>>(new SvelteSet());

	// ---- Injected deps ----
	readonly #data: PersonnelPageData;
	readonly #modals: ModalRegistry;
	readonly #org: OrgContext;
	readonly #personnelStore: PersonnelStoreAccessor;
	readonly #ratingStore: RatingStoreAccessor;
	readonly #pinnedGroupsStore: PinnedGroupsAccessor;

	constructor(
		data: PersonnelPageData,
		modals: ModalRegistry,
		org: OrgContext,
		personnelStore: PersonnelStoreAccessor | Personnel[] = [],
		ratingStore: RatingStoreAccessor | RatingSchemeEntry[] = [],
		pinnedGroupsStore: PinnedGroupsAccessor | string[] = []
	) {
		this.#data = data;
		this.#modals = modals;
		this.#org = org;

		// Allow plain arrays (for tests) or store objects (for the real app)
		this.#personnelStore = Array.isArray(personnelStore)
			? {
					get items() {
						return personnelStore;
					}
				}
			: personnelStore;

		this.#ratingStore = Array.isArray(ratingStore)
			? {
					get items() {
						return ratingStore as RatingSchemeEntry[];
					}
				}
			: (ratingStore as RatingStoreAccessor);

		this.#pinnedGroupsStore = Array.isArray(pinnedGroupsStore)
			? {
					get list() {
						return pinnedGroupsStore as string[];
					}
				}
			: (pinnedGroupsStore as PinnedGroupsAccessor);
	}

	// ---- Permission flags ----

	get canAddPersonnel(): boolean {
		return (this.#data.permissions?.canEditPersonnel ?? false) && !this.#data.scopedGroupId;
	}

	get canManageConfig(): boolean {
		return (this.#org.isOwner || this.#org.isAdmin || this.#org.isFullEditor) ?? false;
	}

	// ---- Derived: filtered personnel ----

	get filteredPersonnel(): Personnel[] {
		const query = this.searchQuery.trim().toLowerCase();
		if (!query) return this.#personnelStore.items;
		return this.#personnelStore.items.filter(
			(p) =>
				p.lastName.toLowerCase().includes(query) ||
				p.firstName.toLowerCase().includes(query) ||
				p.rank.toLowerCase().includes(query) ||
				p.clinicRole.toLowerCase().includes(query)
		);
	}

	get alphabeticalPersonnel(): Personnel[] {
		return [...this.filteredPersonnel].sort((a, b) => {
			const lastNameDiff = a.lastName.localeCompare(b.lastName);
			if (lastNameDiff !== 0) return lastNameDiff;
			return a.firstName.localeCompare(b.firstName);
		});
	}

	get personnelByGroup(): PersonnelGroup[] {
		return groupAndSortPersonnel(this.filteredPersonnel, {
			pinnedGroups: this.#pinnedGroupsStore.list,
			fallbackGroupName: this.#data.orgName
		});
	}

	get totalPersonnel(): number {
		return this.#personnelStore.items.length;
	}

	get filteredCount(): number {
		if (this.viewMode === 'by-group') {
			return this.personnelByGroup.reduce((sum, g) => sum + g.personnel.length, 0);
		}
		return this.alphabeticalPersonnel.length;
	}

	// ---- Derived: rating scheme ----

	get hasAnyWorkflowStatus(): boolean {
		return this.#ratingStore.items.some((e) => !!e.workflowStatus);
	}

	get filteredRatingEntries(): RatingSchemeEntry[] {
		let entries = this.#ratingStore.items;
		if (this.ratingFilter !== 'all') entries = entries.filter((e) => e.status === this.ratingFilter);
		if (this.evalTypeFilter !== 'all') entries = entries.filter((e) => e.evalType === this.evalTypeFilter);
		if (this.workflowFilter !== 'all') entries = entries.filter((e) => e.workflowStatus === this.workflowFilter);
		return entries;
	}

	// ---- Data accessors (for view/modals) ----

	get data(): PersonnelPageData {
		return this.#data;
	}

	get orgId(): string {
		return this.#data.orgId;
	}

	get orgName(): string {
		return this.#data.orgName;
	}

	// ---- Event handlers ----

	handleAdd(): void {
		this.#modals.open('personnel-modal', { person: null });
	}

	handleEdit(person: Personnel): void {
		this.#modals.open('personnel-modal', { person });
	}

	handleAddRatingEntry(): void {
		this.#modals.open('rating-modal', { entry: null });
	}

	handleEditRatingEntry(entry: RatingSchemeEntry): void {
		this.#modals.open('rating-modal', { entry });
	}

	openGroupManager(): void {
		this.#modals.open('group-manager');
	}

	openBulkManager(): void {
		this.#modals.open('bulk-manager');
	}

	toggleGroup(group: string): void {
		if (this.collapsedGroups.has(group)) {
			this.collapsedGroups.delete(group);
		} else {
			this.collapsedGroups.add(group);
		}
	}
}
