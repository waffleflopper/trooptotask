import type { Personnel } from '$lib/types';
import type { RatingSchemeEntry, WorkflowStatus } from '$features/rating-scheme/rating-scheme.types';
import { groupAndSortPersonnel } from '$features/personnel/utils/personnelGrouping';
import type { PersonnelGroup } from '$features/personnel/utils/personnelGrouping';

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
	isOwner?: boolean;
	isAdmin?: boolean;
	isFullEditor?: boolean;
	[key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Reactive store accessors — injected so the context is testable without
// importing the real module-singleton stores.
// ---------------------------------------------------------------------------
export interface PersonnelStoreAccessor {
	readonly list: Personnel[];
}

export interface RatingStoreAccessor {
	readonly list: RatingSchemeEntry[];
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
	collapsedGroups = $state<Set<string>>(new Set());

	// Modal visibility
	showPersonnelModal = $state(false);
	showGroupManager = $state(false);
	showBulkManager = $state(false);
	showRatingModal = $state(false);

	// Editing targets
	editingPerson = $state<Personnel | null>(null);
	editingEntry = $state<RatingSchemeEntry | null>(null);

	// ---- Internal data ----
	#data: PersonnelPageData;
	#personnelStore: PersonnelStoreAccessor;
	#ratingStore: RatingStoreAccessor;
	#pinnedGroupsStore: PinnedGroupsAccessor;

	constructor(
		data: PersonnelPageData,
		personnelStore: PersonnelStoreAccessor | Personnel[] = [],
		ratingStore: RatingStoreAccessor | RatingSchemeEntry[] = [],
		pinnedGroupsStore: PinnedGroupsAccessor | string[] = []
	) {
		this.#data = data;

		// Allow plain arrays (for tests) or store objects (for the real app)
		this.#personnelStore = Array.isArray(personnelStore)
			? {
					get list() {
						return personnelStore;
					}
				}
			: personnelStore;

		this.#ratingStore = Array.isArray(ratingStore)
			? {
					get list() {
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

	// ---- Derived: filtered personnel ----

	get filteredPersonnel(): Personnel[] {
		const query = this.searchQuery.trim().toLowerCase();
		if (!query) return this.#personnelStore.list;
		return this.#personnelStore.list.filter(
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
		return this.#personnelStore.list.length;
	}

	get filteredCount(): number {
		if (this.viewMode === 'by-group') {
			return this.personnelByGroup.reduce((sum, g) => sum + g.personnel.length, 0);
		}
		return this.alphabeticalPersonnel.length;
	}

	// ---- Derived: rating scheme ----

	get hasAnyWorkflowStatus(): boolean {
		return this.#ratingStore.list.some((e) => !!e.workflowStatus);
	}

	get filteredRatingEntries(): RatingSchemeEntry[] {
		let entries = this.#ratingStore.list;
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
		this.editingPerson = null;
		this.showPersonnelModal = true;
	}

	handleEdit(person: Personnel): void {
		this.editingPerson = person;
		this.showPersonnelModal = true;
	}

	closePersonnelModal(): void {
		this.showPersonnelModal = false;
		this.editingPerson = null;
	}

	handleAddRatingEntry(): void {
		this.editingEntry = null;
		this.showRatingModal = true;
	}

	handleEditRatingEntry(entry: RatingSchemeEntry): void {
		this.editingEntry = entry;
		this.showRatingModal = true;
	}

	toggleGroup(group: string): void {
		const newSet = new Set(this.collapsedGroups);
		if (newSet.has(group)) {
			newSet.delete(group);
		} else {
			newSet.add(group);
		}
		this.collapsedGroups = newSet;
	}
}
