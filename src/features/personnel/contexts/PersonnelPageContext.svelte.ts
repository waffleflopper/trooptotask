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
import type { FeatureKey } from '$lib/access/featureSwitches';
import { DEFAULT_LOSS_WARNING_WINDOW_DAYS } from '$features/organization/contracts';

export interface PersonnelPageData {
	orgId: string;
	orgName: string;
	pinnedGroups: string[];
	rankCatalog?: RankCatalogEntry[];
	personnel?: Personnel[];
	/** Org-configured loss warning window in days; `null` when the setting could not be read. */
	lossWarningWindowDays?: number | null;
	awardTrackingAcknowledgedPersonnelIds?: string[];
	/** Features off for the unit, from the app shell's Organization row. */
	disabledFeatures?: readonly FeatureKey[];
	[key: string]: unknown;
}

// Reactive store accessors — injected so the context is testable without
// importing the real module-singleton stores.
export interface PersonnelStoreAccessor {
	readonly items: Personnel[];
}

export interface PinnedGroupsAccessor {
	readonly list: string[];
}

export class PersonnelPageContext {
	viewMode = $state<'alphabetical' | 'by-group'>('by-group');
	searchQuery = $state('');
	collapsedGroups = $state<SvelteSet<string>>(new SvelteSet());

	readonly #data: PersonnelPageData;
	readonly #modals: ModalRegistry;
	readonly #org: PersonnelPageAccess;
	readonly #personnelStore: PersonnelStoreAccessor;
	readonly #pinnedGroupsStore: PinnedGroupsAccessor;
	/** Injectable so tests can pin the date without real-time dependencies. */
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

		const now = new SvelteDate();
		this.#today =
			today ??
			`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

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

	/** The detail page requires sensitive-record reading unscoped, so an actor without it can open no record. */
	get canReadPersonnelDetails(): boolean {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.readSensitiveRecords, {
			kind: 'unscoped'
		}).allowed;
	}

	/** The detail page also admits only records the header lets the actor manage. */
	canOpenPersonnelDetail(person: Personnel): boolean {
		return this.canReadPersonnelDetails && this.canManagePersonnelRecord(person);
	}

	personnelArchiveAffordance(person: Personnel): PersonnelAffordance {
		return this.personnelRecordAffordance(person);
	}

	canArchivePersonnelRecord(person: Personnel): boolean {
		return this.personnelArchiveAffordance(person).allowed;
	}

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

	/** Reuses the same shared evaluation path as the dashboard widget so the roster and dashboard always agree on who is "approaching loss." */
	get upcomingLossMap(): SvelteMap<string, UpcomingLossRecord> {
		const map = new SvelteMap<string, UpcomingLossRecord>();
		const warningWindowDays = this.#data.lossWarningWindowDays;
		if (warningWindowDays === null || this.#data.disabledFeatures?.includes('lossesAndAwards')) return map;
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
