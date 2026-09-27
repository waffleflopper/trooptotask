import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { resolve } from '$app/paths';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { trainingRankCatalogStore } from '$features/training/stores/rankCatalog.svelte';
import { rosterStore } from '$features/personnel';
import { getTrainingStats } from '$features/training/utils/trainingStatus';
import { groupsStore } from '$features/personnel';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createRosterReadModel, type PersonnelGroup, type RosterReadModelView } from '$features/personnel/contracts';
import type { ClientAffordance } from '$lib/stores/orgContext.svelte';
import type { RankCatalogEntry } from '$features/personnel/contracts';
import type {
	TrainingMatrixViewMode,
	UserOrgPreferences,
	UserOrgPreferencesPatch
} from '$lib/preferences/userPreferences';
import type { OrgContext } from '$lib/stores/orgContext.svelte';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { Personnel } from '$lib/types';
import type { Group } from '$features/personnel/contracts';
import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
import type { OverflowItem } from '$lib/components/ui/OverflowMenu.types';

const TRAINING_POLICY_RESOURCE = { kind: 'unscoped' } as const;
type TrainingBatchCompletionRecord = {
	personnelId: string;
	trainingTypeId: string;
	completionDate: string | null;
	notes?: string;
	status: 'completed';
};
type NavigationModule = typeof import('$app/navigation');
type DeletionRequestsModule = typeof import('$lib/utils/deletionRequests');
type ToastStoreModule = typeof import('$lib/stores/toast.svelte');
type UserPreferencesClientModule = typeof import('$lib/preferences/userPreferences.client');

let navigationModule: Promise<NavigationModule> | undefined;
let deletionRequestsModule: Promise<DeletionRequestsModule> | undefined;
let toastStoreModule: Promise<ToastStoreModule> | undefined;
let userPreferencesClientModule: Promise<UserPreferencesClientModule> | undefined;

function loadNavigation() {
	navigationModule ??= import('$app/navigation');
	return navigationModule;
}

function loadDeletionRequests() {
	deletionRequestsModule ??= import('$lib/utils/deletionRequests');
	return deletionRequestsModule;
}

function loadToastStore() {
	toastStoreModule ??= import('$lib/stores/toast.svelte');
	return toastStoreModule;
}

function loadUserPreferencesClient() {
	userPreferencesClientModule ??= import('$lib/preferences/userPreferences.client');
	return userPreferencesClientModule;
}

// ---------------------------------------------------------------------------
// Page data shape (from +page.server.ts + layout)
// ---------------------------------------------------------------------------
export interface TrainingPageData {
	orgId: string;
	orgName: string;
	userPreferences?: UserOrgPreferences;
	training?: {
		data?: {
			rankCatalog?: RankCatalogEntry[];
		};
	};
}

// ---------------------------------------------------------------------------
// TrainingPageContext
// ---------------------------------------------------------------------------
export class TrainingPageContext {
	// ---- injected deps ----
	readonly #data: TrainingPageData;
	readonly #modals: ModalRegistry;
	readonly #org: OrgContext;
	#hydratedSelectionFingerprint: string | null = null;

	// ---- mutable UI state ----
	selectedGroupId = $state<string>('');
	selectedViewId = $state<string | null>(null);
	viewMode = $state<TrainingMatrixViewMode>('by-group');
	collapsedGroups = $state<SvelteSet<string>>(new SvelteSet());

	constructor(data: TrainingPageData, modals: ModalRegistry, org: OrgContext) {
		this.#data = data;
		this.#modals = modals;
		this.#org = org;
		this.applyUserPreferences(data.userPreferences);
	}

	// ---- permission flags ----
	get canManageConfig(): boolean {
		return this.trainingConfigureAffordance.visible;
	}

	get canViewTraining(): boolean {
		return this.trainingViewAffordance.allowed;
	}

	get canRecordTraining(): boolean {
		return this.trainingRecordAffordance.allowed;
	}

	get trainingViewAffordance(): ClientAffordance {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.training.viewMatrix, TRAINING_POLICY_RESOURCE);
	}

	get trainingRecordAffordance(): ClientAffordance {
		return this.#org.affordanceForFeatureAction(
			POLICY_ACTION_CATALOG.training.recordCompletions,
			TRAINING_POLICY_RESOURCE
		);
	}

	get trainingConfigureAffordance(): ClientAffordance {
		return this.#org.affordanceForFeatureAction(
			POLICY_ACTION_CATALOG.training.configureRequirements,
			TRAINING_POLICY_RESOURCE
		);
	}

	// ---- data accessors ----
	get orgId(): string {
		return this.#data.orgId;
	}

	get orgUrlSegment(): string {
		return this.#org.orgUrlSegment ?? this.#data.orgId;
	}

	get orgName(): string {
		return this.#data.orgName;
	}

	get personnel(): Personnel[] {
		this.reconcileHydratedSelections();
		return this.trainingRosterView().flatPersonnel;
	}

	get groups(): Group[] {
		this.reconcileHydratedSelections();
		return groupsStore.orgId === this.orgId ? groupsStore.items : [];
	}

	get rankCatalog(): RankCatalogEntry[] {
		const rankCatalog = this.#data.training?.data?.rankCatalog;
		if (Array.isArray(rankCatalog)) return rankCatalog;
		return trainingRankCatalogStore.orgId === this.orgId ? trainingRankCatalogStore.items : [];
	}

	get savedViewIds(): Set<string> {
		this.reconcileHydratedSelections();
		return new SvelteSet(trainingViewsStore.items.map((view) => view.id));
	}

	// ---- derived: roles ----
	get availableRoles(): string[] {
		return [...new SvelteSet(this.personnel.map((p) => p.clinicRole))].filter(Boolean).sort() as string[];
	}

	// ---- derived: filtered/sorted personnel ----
	get basePersonnel(): Personnel[] {
		this.reconcileHydratedSelections();
		return this.trainingRosterView({ groupFilter: this.selectedGroupId || undefined }).flatPersonnel;
	}

	get filteredPersonnel(): Personnel[] {
		return [...this.basePersonnel].sort((a, b) => {
			const lastNameDiff = a.lastName.localeCompare(b.lastName);
			if (lastNameDiff !== 0) return lastNameDiff;
			return a.firstName.localeCompare(b.firstName);
		});
	}

	get groupOrder(): string[] {
		return groupsStore.orgId === this.orgId ? groupsStore.items.map((g) => g.name) : [];
	}

	get personnelByGroup(): PersonnelGroup[] {
		return this.trainingRosterView({ groupFilter: this.selectedGroupId || undefined }).personnelByGroup;
	}

	get groupFilterOptions(): Array<{ value: string; label: string }> {
		const rosterOptions = this.trainingRosterView().groupFilterOptions.map((option) => ({
			value: option.value,
			label: option.value ? option.label : 'Group: All'
		}));
		if (groupsStore.orgId !== this.orgId) {
			return rosterOptions;
		}

		const optionsByValue = new SvelteMap(rosterOptions.map((option) => [option.value, option]));
		const orderedOptions = [optionsByValue.get('') ?? { value: '', label: 'Group: All' }];

		for (const group of groupsStore.items) {
			orderedOptions.push(optionsByValue.get(group.id) ?? { value: group.id, label: group.name });
			optionsByValue.delete(group.id);
		}

		optionsByValue.delete('');
		return [...orderedOptions, ...optionsByValue.values()];
	}

	// ---- derived: stats ----
	get stats() {
		return getTrainingStats(this.filteredPersonnel, trainingTypesStore.items, personnelTrainingsStore.items);
	}

	// ---- derived: overflow menu ----
	get trainingOverflowItems(): OverflowItem[] {
		const items: OverflowItem[] = [];
		items.push({ label: 'Sign-In Rosters', onclick: () => this.#modals.open('sign-in-rosters') });
		items.push({
			label: 'Reports',
			onclick: () => {
				void loadNavigation().then(({ goto }) => goto(resolve(`/org/${this.orgUrlSegment}/training/reports`)));
			}
		});
		if (this.canManageConfig) {
			items.push({
				label: 'Bulk Import',
				onclick: () => this.#modals.open('bulk-import'),
				divider: true
			});
			items.push({
				label: 'Manage Types',
				onclick: () => {
					void loadNavigation().then(({ goto }) => goto(resolve(`/org/${this.orgUrlSegment}/training/types`)));
				}
			});
		}
		return items;
	}

	// ---- helpers ----
	isExempt(person: Personnel, type: TrainingType): boolean {
		return type.canBeExempted && type.exemptPersonnelIds.includes(person.id);
	}

	// ---- UI handlers ----
	toggleGroup(group: string): void {
		if (this.collapsedGroups.has(group)) {
			this.collapsedGroups.delete(group);
		} else {
			this.collapsedGroups.add(group);
		}
	}

	handleCellClick(person: Personnel, type: TrainingType, training: PersonnelTraining | undefined): void {
		this.#modals.open('record', { person, type, training });
	}

	handlePersonClick(person: Personnel): void {
		this.#modals.open('person-editor', { person });
	}

	setSelectedGroupId(groupId: string): void {
		this.selectedGroupId = this.isValidGroupId(groupId) ? groupId : '';
		void this.persistPreferences({
			training: {
				selectedGroupId: this.selectedGroupId || null
			}
		});
	}

	setSelectedViewId(viewId: string | null): void {
		this.selectedViewId = viewId && this.savedViewIds.has(viewId) ? viewId : null;
		void this.persistPreferences({
			training: {
				selectedViewId: this.selectedViewId
			}
		});
	}

	setViewMode(viewMode: TrainingMatrixViewMode): void {
		this.viewMode = viewMode;
		void this.persistPreferences({
			training: {
				matrixViewMode: viewMode
			}
		});
	}

	// ---- async handlers ----
	async handleSaveTraining(data: Omit<PersonnelTraining, 'id'>): Promise<void> {
		await personnelTrainingsStore.add(data);
	}

	async handleSaveTrainingBatch(records: TrainingBatchCompletionRecord[]): Promise<void> {
		const res = await fetch(`/org/${this.orgId}/api/personnel-trainings/batch`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ records })
		});

		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			throw new Error(data.message ?? `HTTP ${res.status}`);
		}

		personnelTrainingsStore.addBatchResults(data.inserted ?? [], data.updated ?? []);
	}

	async handleRemoveTraining(id: string): Promise<void> {
		const training = personnelTrainingsStore.getById(id);
		const result = await personnelTrainingsStore.remove(id);
		if (result === 'approval_required' && training) {
			const person = this.personnel.find((p) => p.id === training.personnelId);
			const type = trainingTypesStore.items.find((t) => t.id === training.trainingTypeId);
			const desc = `${type?.name ?? 'Training'} record for ${person ? `${person.rank} ${person.lastName}` : 'unknown'}`;
			const { submitDeletionRequest } = await loadDeletionRequests();
			await submitDeletionRequest(this.orgId, 'personnel_training', id, desc, `/org/${this.orgId}/training`);
		}
	}

	async handleAddType(data: Omit<TrainingType, 'id'>): Promise<void> {
		await trainingTypesStore.add(data);
	}

	async handleUpdateType(id: string, data: Partial<Omit<TrainingType, 'id'>>): Promise<void> {
		await trainingTypesStore.update(id, data);
	}

	async handleRemoveType(id: string): Promise<void> {
		const type = trainingTypesStore.items.find((t) => t.id === id);
		const result = await trainingTypesStore.remove(id);
		if (result === 'approval_required' && type) {
			const { submitDeletionRequest } = await loadDeletionRequests();
			await submitDeletionRequest(
				this.orgId,
				'training_type',
				id,
				`Training type: ${type.name}`,
				`/org/${this.orgId}/training`
			);
		} else if (result === 'deleted') {
			personnelTrainingsStore.removeByTrainingTypeLocal(id);
		}
	}

	async handleToggleExempt(typeId: string, personId: string, exempt: boolean): Promise<void> {
		const type = trainingTypesStore.items.find((t) => t.id === typeId);
		if (!type) return;
		const currentIds = type.exemptPersonnelIds;
		const updatedIds = exempt ? [...currentIds, personId] : currentIds.filter((id) => id !== personId);
		await trainingTypesStore.update(typeId, { exemptPersonnelIds: updatedIds });
	}

	async handleBulkImportComplete(): Promise<void> {
		const { invalidate } = await loadNavigation();
		await invalidate('app:training-data');
		this.#modals.close('bulk-import');
	}

	private applyUserPreferences(preferences?: UserOrgPreferences): void {
		const trainingPrefs = preferences?.training;
		const selectedGroupId = trainingPrefs?.selectedGroupId ?? null;
		const selectedViewId = trainingPrefs?.selectedViewId ?? null;
		const groupsLoaded = groupsStore.orgId === this.orgId && !groupsStore.loading;
		const rosterLoaded = rosterStore.orgId === this.orgId && !rosterStore.loading;
		const viewsLoaded = trainingViewsStore.orgId === this.orgId && !trainingViewsStore.loading;

		this.selectedGroupId =
			selectedGroupId && (!groupsLoaded || !rosterLoaded || this.isValidGroupId(selectedGroupId))
				? selectedGroupId
				: '';
		this.selectedViewId =
			selectedViewId && (!viewsLoaded || this.savedViewIds.has(selectedViewId)) ? selectedViewId : null;
		this.viewMode = trainingPrefs?.matrixViewMode ?? 'by-group';
	}

	private reconcileHydratedSelections(): void {
		const fingerprint = this.getHydratedSelectionFingerprint();
		if (this.#hydratedSelectionFingerprint === fingerprint) {
			return;
		}

		const groupsLoaded = groupsStore.orgId === this.orgId && !groupsStore.loading;
		const rosterLoaded = rosterStore.orgId === this.orgId && !rosterStore.loading;
		const viewsLoaded = trainingViewsStore.orgId === this.orgId && !trainingViewsStore.loading;

		const patch: NonNullable<UserOrgPreferencesPatch['training']> = {};

		if (groupsLoaded && rosterLoaded && this.selectedGroupId && !this.isValidGroupId(this.selectedGroupId)) {
			this.selectedGroupId = '';
			patch.selectedGroupId = null;
		}

		if (
			viewsLoaded &&
			this.selectedViewId &&
			!trainingViewsStore.items.some((view) => view.id === this.selectedViewId)
		) {
			this.selectedViewId = null;
			patch.selectedViewId = null;
		}

		if (Object.keys(patch).length > 0) {
			void this.persistPreferences({ training: patch });
		}

		this.#hydratedSelectionFingerprint = this.getHydratedSelectionFingerprint();
	}

	private isValidGroupId(groupId: string | null): boolean {
		if (!groupId) return false;
		if (groupsStore.orgId === this.orgId && groupsStore.items.some((group) => group.id === groupId)) {
			return true;
		}
		return this.groupFilterOptions.some((option) => option.value === groupId);
	}

	private getHydratedSelectionFingerprint(): string {
		const groupIds =
			groupsStore.orgId === this.orgId && !groupsStore.loading
				? groupsStore.items.map((group) => group.id).join(',')
				: 'pending';
		const groupFilterValues =
			rosterStore.orgId === this.orgId && !rosterStore.loading
				? this.groupFilterOptions.map((option) => option.value).join(',')
				: 'pending';
		const viewIds =
			trainingViewsStore.orgId === this.orgId && !trainingViewsStore.loading
				? trainingViewsStore.items.map((view) => view.id).join(',')
				: 'pending';

		return [this.orgId, this.selectedGroupId, this.selectedViewId, groupIds, groupFilterValues, viewIds].join('|');
	}

	private async persistPreferences(preferences: UserOrgPreferencesPatch): Promise<void> {
		try {
			const { queueUserPreferencesPatch } = await loadUserPreferencesClient();
			await queueUserPreferencesPatch(this.orgId, preferences);
		} catch (error) {
			const { toastStore } = await loadToastStore();
			toastStore.error(error instanceof Error ? error.message : 'Failed to save your training preferences');
		}
	}

	private trainingRosterView(options: { groupFilter?: string } = {}): RosterReadModelView {
		if (rosterStore.orgId !== this.orgId) {
			return createRosterReadModel({
				personnel: [],
				groupOrder: this.groupOrder,
				fallbackGroupName: this.orgName
			}).scoped(this.#org.scopeSet, { status: 'active', ...options });
		}

		return rosterStore
			.readModel({
				groupOrder: this.groupOrder,
				fallbackGroupName: this.orgName
			})
			.scoped(this.#org.scopeSet, { status: 'active', ...options });
	}
}
