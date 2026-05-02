import { SvelteDate, SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { Personnel, OrganizationMemberPermissions } from '$lib/types';
import { groupAndSortPersonnel } from '$features/personnel/utils/personnelGrouping';
import type { PersonnelGroup } from '$features/personnel/utils/personnelGrouping';
import type { ClientAffordance, OrgContext } from '$lib/stores/orgContext.svelte';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { evaluateUpcomingLosses, type UpcomingLossRecord } from '$features/dashboard/utils/evaluateUpcomingLosses';

// ---------------------------------------------------------------------------
// Data shape expected from the page server / layout
// ---------------------------------------------------------------------------
export interface PersonnelPageData {
	orgId: string;
	orgName: string;
	pinnedGroups: string[];
	personnel?: Personnel[];
	permissions?: OrganizationMemberPermissions | null;
	/** Org-configured loss warning window in days (default: 180). */
	lossWarningWindowDays?: number;
	/** Personnel IDs whose award tracking has been acknowledged. */
	awardTrackingAcknowledgedPersonnelIds?: string[];
	[key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Reactive store accessors — injected so the context is testable without
// importing the real module-singleton stores.
// ---------------------------------------------------------------------------
export interface PersonnelStoreAccessor {
	readonly items: Personnel[];
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
	searchQuery = $state('');
	collapsedGroups = $state<SvelteSet<string>>(new SvelteSet());

	// ---- Injected deps ----
	readonly #data: PersonnelPageData;
	readonly #modals: ModalRegistry;
	readonly #org: OrgContext;
	readonly #personnelStore: PersonnelStoreAccessor;
	readonly #pinnedGroupsStore: PinnedGroupsAccessor;
	/**
	 * Reference date for upcoming-loss evaluation.
	 * Injectable so tests can pin the date without real-time dependencies.
	 * Defaults to today's local date in production.
	 */
	readonly #today: string;

	constructor(
		data: PersonnelPageData,
		modals: ModalRegistry,
		org: OrgContext,
		personnelStore: PersonnelStoreAccessor | Personnel[] = [],
		pinnedGroupsStore: PinnedGroupsAccessor | string[] = [],
		today?: string
	) {
		this.#data = data;
		this.#modals = modals;
		this.#org = org;

		// Pin to the provided date or fall back to the local calendar date
		const now = new SvelteDate();
		this.#today =
			today ??
			`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

		// Allow plain arrays (for tests) or store objects (for the real app)
		this.#personnelStore = Array.isArray(personnelStore)
			? {
					get items() {
						return personnelStore;
					}
				}
			: personnelStore;

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
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.manageRecords).allowed;
	}

	get canManageConfig(): boolean {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.archiveRecords).allowed;
	}

	personnelRecordAffordance(person: Personnel): ClientAffordance {
		return this.#org.affordanceForFeatureAction(
			POLICY_ACTION_CATALOG.personnel.manageRecords,
			person.groupId ? { kind: 'group', groupId: person.groupId } : { kind: 'organization' }
		);
	}

	canManagePersonnelRecord(person: Personnel): boolean {
		return this.personnelRecordAffordance(person).allowed;
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

	// ---- Derived: upcoming losses ----

	/**
	 * Map of personId → UpcomingLossRecord for personnel inside the configured
	 * warning window.  Used by the roster to render per-row loss indicators
	 * without duplicating date-threshold logic.
	 *
	 * Reuses the same shared evaluation path as the dashboard widget so the
	 * roster and dashboard always agree on who is "approaching loss."
	 */
	get upcomingLossMap(): SvelteMap<string, UpcomingLossRecord> {
		const warningWindowDays = this.#data.lossWarningWindowDays ?? 180;
		const losses = evaluateUpcomingLosses(this.#personnelStore.items, warningWindowDays, this.#today, {
			awardTrackingAcknowledgedPersonnelIds: this.#data.awardTrackingAcknowledgedPersonnelIds ?? []
		});
		const map = new SvelteMap<string, UpcomingLossRecord>();
		for (const record of losses) {
			map.set(record.personId, record);
		}
		return map;
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
