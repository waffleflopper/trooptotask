import { SvelteSet } from 'svelte/reactivity';
import type { Personnel } from '../personnel.types';
import { personnelScopeResource } from '../personnelScopeResource';
import type { Group, RankCatalogEntry } from '$features/personnel/contracts';
import {
	createRosterReadModel,
	type PersonnelGroup,
	type RosterReadModelView
} from '$features/personnel/rosterReadModel';
import type { PersonnelAffordance, PersonnelPageAccess } from '../contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { UpcomingLossRecord } from '$features/personnel/contracts';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { DEFAULT_LOSS_WARNING_WINDOW_DAYS } from '$features/organization/contracts';
import {
	chipAvailable,
	projectRosterLosses,
	ROSTER_CHIPS,
	signalAccessBy,
	type RosterLoss,
	type SignalRow,
	type SummaryState
} from '../rosterSignals';
import { RosterPeek } from '../rosterPeek.svelte';
import { RosterSignals } from '../rosterSignals.svelte';

export interface PersonnelPageData {
	orgId: string;
	asOf: string;
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

export interface GroupsAccessor {
	readonly orgId: string | null;
	readonly items: readonly Group[];
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
	readonly #groupsStore: GroupsAccessor;
	readonly signals: RosterSignals;
	readonly peek: RosterPeek;

	constructor(
		data: PersonnelPageData,
		modals: ModalRegistry,
		org: PersonnelPageAccess,
		personnelStore: PersonnelStoreAccessor | Personnel[] = [],
		pinnedGroupsStore: PinnedGroupsAccessor | string[] = [],
		signals: RosterSignals = new RosterSignals(),
		groupsStore: GroupsAccessor | null = null,
		peek: RosterPeek = new RosterPeek(data.orgId)
	) {
		this.#data = data;
		this.#modals = modals;
		this.#org = org;
		this.signals = signals;
		this.#groupsStore = groupsStore ?? { orgId: data.orgId, items: [] };
		this.peek = peek;

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

	get canViewAvailability(): boolean {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.viewAvailability, {
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

	canManagePersonnelInGroup(groupId: string | null): boolean {
		return this.#org.affordanceForFeatureAction(
			POLICY_ACTION_CATALOG.personnel.manageRecords,
			groupId ? { kind: 'group', groupId } : { kind: 'organization' }
		).allowed;
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

	canExportPersonnelRecord(person: Personnel): boolean {
		return this.#org.affordanceForFeatureAction(
			POLICY_ACTION_CATALOG.personnel.exportRecords,
			person.groupId ? { kind: 'group', groupId: person.groupId } : { kind: 'organization' }
		).allowed;
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

	get lossesEnabled(): boolean {
		return !this.#data.disabledFeatures?.includes('lossesAndAwards');
	}

	get expectedChipCount(): number {
		const access = signalAccessBy(
			(action) => this.#org.affordanceForFeatureAction(action, { kind: 'unscoped' }).allowed,
			this.#data.disabledFeatures ?? []
		);
		return ROSTER_CHIPS.filter((chip) => chipAvailable(chip, access, this.lossesEnabled)).length;
	}

	readonly rosterLosses: ReadonlyMap<string, RosterLoss> = $derived.by(() => {
		const warningWindowDays = this.#data.lossWarningWindowDays;
		return projectRosterLosses({
			people: this.allActivePersonnel,
			asOf: this.#data.asOf,
			lossWarningWindowDays: warningWindowDays === undefined ? DEFAULT_LOSS_WARNING_WINDOW_DAYS : warningWindowDays,
			lossesEnabled: this.lossesEnabled,
			awardTrackingAcknowledgedPersonnelIds: this.#data.awardTrackingAcknowledgedPersonnelIds ?? []
		});
	});

	readonly upcomingLossMap: ReadonlyMap<string, UpcomingLossRecord> = $derived.by(() => {
		const entries = [...this.rosterLosses].flatMap(([id, loss]) => (loss.badge ? [[id, loss.badge] as const] : []));
		return new Map(entries);
	});

	signalRow(person: Pick<Personnel, 'id'>): SignalRow {
		return this.signals.row(person.id, this.rosterLosses.get(person.id) ?? null);
	}

	summarizeSignals(people: readonly Pick<Personnel, 'id'>[]): SummaryState {
		return this.signals.summarize(
			people.map((person) => person.id),
			this.rosterLosses,
			this.lossesEnabled
		);
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

	openGroupEditor(groupId: string | null): void {
		this.#modals.open('group-manager', { select: groupId });
	}

	get groupOrder(): string[] {
		if (this.#groupsStore.orgId !== this.orgId) return [];
		return [...this.#groupsStore.items]
			.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
			.map((group) => group.name);
	}

	groupIdForName(name: string): string | null {
		return this.#groupsStore.items.find((group) => group.name === name)?.id ?? null;
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
			groupOrder: this.groupOrder,
			fallbackGroupName: this.#data.orgName
		}).full({ status: 'active' });
	}

	private get rosterView(): RosterReadModelView {
		return createRosterReadModel({
			personnel: this.#personnelStore.items,
			pinnedGroups: this.#pinnedGroupsStore.list,
			groupOrder: this.groupOrder,
			fallbackGroupName: this.#data.orgName
		}).full({ status: 'active', search: this.searchQuery });
	}
}
