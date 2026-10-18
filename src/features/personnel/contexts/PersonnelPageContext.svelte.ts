import { SvelteDate, SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { Personnel } from '../personnel.types';
import { personnelScopeResource } from '../personnelScopeResource';
import type { RankCatalogEntry } from '$features/personnel/contracts';
import {
	createRosterReadModel,
	type PersonnelGroup,
	type RosterReadModelView
} from '$features/personnel/rosterReadModel';
import type { PersonnelAffordance, PersonnelPageAccess } from '../contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { evaluateUpcomingLosses, type UpcomingLossRecord } from '$features/personnel/contracts';
import { DEFAULT_LOSS_WARNING_WINDOW_DAYS } from '$features/organization/contracts';

// ---------------------------------------------------------------------------
// Data shape expected from the page server / layout
// ---------------------------------------------------------------------------
export interface PersonnelPageData {
	orgId: string;
	orgName: string;
	pinnedGroups: string[];
	rankCatalog?: RankCatalogEntry[];
	personnel?: Personnel[];
	/** Org-configured loss warning window in days; `null` when the setting could not be read. */
	lossWarningWindowDays?: number | null;
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
	readonly #org: PersonnelPageAccess;
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
		org: PersonnelPageAccess,
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

	get canViewRoster(): boolean {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.viewRoster, {
			kind: 'unscoped'
		}).allowed;
	}

	get canAddPersonnel(): boolean {
		const resource = personnelScopeResource(this.#org.scopeSet);
		return (
			resource !== null &&
			this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.createRecords, resource).allowed
		);
	}

	get allowUnassignedPersonnel(): boolean {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.createRecords, { kind: 'organization' })
			.allowed;
	}

	canCreatePersonnelInGroup(groupId: string): boolean {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.createRecords, {
			kind: 'group',
			groupId
		}).allowed;
	}

	get canImportPersonnel(): boolean {
		const resource = personnelScopeResource(this.#org.scopeSet);
		return (
			resource !== null &&
			this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.importRecords, resource).allowed
		);
	}

	get canManageGroups(): boolean {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.manageGroups).allowed;
	}

	get canManageConfig(): boolean {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.archiveRecords).allowed;
	}

	personnelRecordAffordance(person: Personnel): PersonnelAffordance {
		return this.#org.affordanceForFeatureAction(
			POLICY_ACTION_CATALOG.personnel.manageRecords,
			person.groupId ? { kind: 'group', groupId: person.groupId } : { kind: 'organization' }
		);
	}

	canManagePersonnelRecord(person: Personnel): boolean {
		return this.personnelRecordAffordance(person).allowed;
	}

	/** The detail page admits the header's record access and, unscoped, sensitive-record reading. */
	canOpenPersonnelDetail(person: Personnel): boolean {
		return (
			this.canManagePersonnelRecord(person) &&
			this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.readSensitiveRecords, {
				kind: 'unscoped'
			}).allowed
		);
	}

	personnelArchiveAffordance(person: Personnel): PersonnelAffordance {
		return this.personnelRecordAffordance(person);
	}

	canArchivePersonnelRecord(person: Personnel): boolean {
		return this.personnelArchiveAffordance(person).allowed;
	}

	// ---- Derived: filtered personnel ----

	get filteredPersonnel(): Personnel[] {
		return this.rosterView.flatPersonnel;
	}

	get alphabeticalPersonnel(): Personnel[] {
		return [...this.filteredPersonnel].sort((a, b) => {
			const lastNameDiff = a.lastName.localeCompare(b.lastName);
			if (lastNameDiff !== 0) return lastNameDiff;
			return a.firstName.localeCompare(b.firstName);
		});
	}

	get personnelByGroup(): PersonnelGroup[] {
		return this.rosterView.personnelByGroup;
	}

	get totalPersonnel(): number {
		return this.allActivePersonnel.length;
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
		const map = new SvelteMap<string, UpcomingLossRecord>();
		const warningWindowDays = this.#data.lossWarningWindowDays;
		if (warningWindowDays === null) return map;
		const losses = evaluateUpcomingLosses(
			this.allActivePersonnel,
			warningWindowDays ?? DEFAULT_LOSS_WARNING_WINDOW_DAYS,
			this.#today,
			{ awardTrackingAcknowledgedPersonnelIds: this.#data.awardTrackingAcknowledgedPersonnelIds ?? [] }
		);
		for (const record of losses) {
			map.set(record.personId, record);
		}
		return map;
	}

	/** The loss warning window could not be read, so the roster shows no loss flags. */
	get lossWarningsUnavailable(): boolean {
		return this.#data.lossWarningWindowDays === null;
	}

	// ---- Data accessors (for view/modals) ----

	get data(): PersonnelPageData {
		return this.#data;
	}

	get orgId(): string {
		return this.#data.orgId;
	}

	get orgUrlSegment(): string {
		return this.#org.orgUrlSegment ?? this.#data.orgId;
	}

	get orgName(): string {
		return this.#data.orgName;
	}

	get allActivePersonnel(): Personnel[] {
		return this.rosterViewWithoutSearch.flatPersonnel;
	}

	getPersonnelById(personnelId: string): Personnel | undefined {
		return this.rosterViewWithoutSearch.getById(personnelId);
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

	toggleGroup(group: string): void {
		if (this.collapsedGroups.has(group)) {
			this.collapsedGroups.delete(group);
		} else {
			this.collapsedGroups.add(group);
		}
	}

	private get rosterViewWithoutSearch(): RosterReadModelView {
		return createRosterReadModel({
			personnel: this.#personnelStore.items,
			pinnedGroups: this.#pinnedGroupsStore.list,
			fallbackGroupName: this.#data.orgName
		}).full({ status: 'active' });
	}

	private get rosterView(): RosterReadModelView {
		return createRosterReadModel({
			personnel: this.#personnelStore.items,
			pinnedGroups: this.#pinnedGroupsStore.list,
			fallbackGroupName: this.#data.orgName
		}).full({ status: 'active', search: this.searchQuery });
	}
}
