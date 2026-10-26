import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { trainingRankCatalogStore } from '$features/training/stores/rankCatalog.svelte';
import { rosterStore } from '$features/personnel';
import { getTrainingStats } from '$features/training/utils/trainingStatus';
import { groupsStore } from '$features/personnel';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { rejectedRequestMessage } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';
import { createRosterReadModel, type PersonnelGroup, type RosterReadModelView } from '$features/personnel/contracts';
import type { RankCatalogEntry } from '$features/personnel/contracts';
import type {
	TrainingPageAccess,
	TrainingAffordance,
	TrainingMatrixViewMode,
	TrainingPagePreferences,
	TrainingPreferencesPatch
} from '../contracts';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { Personnel } from '$features/personnel/contracts';
import type { Group } from '$features/personnel/contracts';
import type { TrainingType, TrainingView, PersonnelTraining } from '$features/training/training.types';
import type { TrainingBatchRecord } from '../contracts';
import { recordTrainingCompletions } from '../personnelTrainingRequests';
import { matchesPersonnelSearch } from '../utils/personnelSearch';
import { trainingReadinessSource } from '../webSources.svelte';

const TRAINING_POLICY_RESOURCE = { kind: 'unscoped' } as const;
const TRAINING_CONFIGURATION_RESOURCE = { kind: 'organization' } as const;
type TrainingBatchCompletionRecord = TrainingBatchRecord & { status: 'completed' };
export type TrainingRemovalRequest = (
	orgId: string,
	resourceType: 'personnel_training',
	resourceId: string,
	description: string,
	resourceUrl: string,
	isCurrent: () => boolean
) => Promise<boolean>;

export interface TrainingPageData {
	orgId: string;
	orgName: string;
	userPreferences?: { training?: TrainingPagePreferences };
	training?: {
		data?: {
			rankCatalog?: RankCatalogEntry[];
		};
	};
}

export class TrainingPageContext {
	readonly #data: TrainingPageData;
	readonly #modals: ModalRegistry;
	readonly #org: TrainingPageAccess;
	readonly #submitRemovalRequest: TrainingRemovalRequest;
	readonly #savePreferences: (patch: TrainingPreferencesPatch) => void;
	#hydratedSelectionFingerprint: string | null = null;
	readonly #deletingViewIds = new Set<string>();
	#disposed = false;

	selectedGroupId = $state<string>('');
	selectedViewId = $state<string | null>(null);
	searchQuery = $state('');
	viewMode = $state<TrainingMatrixViewMode>('by-group');
	collapsedGroups = $state<SvelteSet<string>>(new SvelteSet());

	constructor(
		data: TrainingPageData,
		modals: ModalRegistry,
		org: TrainingPageAccess,
		submitRemovalRequest: TrainingRemovalRequest,
		savePreferences: (patch: TrainingPreferencesPatch) => void
	) {
		this.#data = data;
		this.#modals = modals;
		this.#org = org;
		this.#submitRemovalRequest = submitRemovalRequest;
		this.#savePreferences = savePreferences;
		this.applyUserPreferences(data.userPreferences);
	}

	get canManageConfig(): boolean {
		return this.trainingConfigureAffordance.visible;
	}

	get canViewTraining(): boolean {
		return this.trainingViewAffordance.allowed;
	}

	get canRecordTraining(): boolean {
		return this.trainingRecordAffordance.allowed;
	}

	get trainingViewAffordance(): TrainingAffordance {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.training.viewMatrix, TRAINING_POLICY_RESOURCE);
	}

	get trainingRecordAffordance(): TrainingAffordance {
		return this.#org.affordanceForFeatureAction(
			POLICY_ACTION_CATALOG.training.recordCompletions,
			TRAINING_POLICY_RESOURCE
		);
	}

	get trainingConfigureAffordance(): TrainingAffordance {
		return this.#org.affordanceForFeatureAction(
			POLICY_ACTION_CATALOG.training.configureRequirements,
			TRAINING_CONFIGURATION_RESOURCE
		);
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

	get readinessGoalPercent(): number | null {
		return trainingReadinessSource.forOrganization(this.orgId).readinessGoalPercent;
	}

	get readinessAsOf(): string {
		return trainingReadinessSource.forOrganization(this.orgId).readinessAsOf;
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

	get availableRoles(): string[] {
		return [...new SvelteSet(this.personnel.map((p) => p.clinicRole))].filter(Boolean).sort() as string[];
	}

	get basePersonnel(): Personnel[] {
		this.reconcileHydratedSelections();
		return this.trainingRosterView({ groupFilter: this.selectedGroupId || undefined }).flatPersonnel;
	}

	get filteredPersonnel(): Personnel[] {
		return this.basePersonnel
			.filter((person) => matchesPersonnelSearch(person, this.searchQuery))
			.sort((a, b) => {
				const lastNameDiff = a.lastName.localeCompare(b.lastName);
				if (lastNameDiff !== 0) return lastNameDiff;
				return a.firstName.localeCompare(b.firstName);
			});
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

	get stats() {
		return getTrainingStats(this.filteredPersonnel, trainingTypesStore.items, personnelTrainingsStore.items);
	}

	isExempt(person: Personnel, type: TrainingType): boolean {
		return type.canBeExempted && type.exemptPersonnelIds.includes(person.id);
	}

	toggleGroup(group: string): void {
		if (this.collapsedGroups.has(group)) {
			this.collapsedGroups.delete(group);
		} else {
			this.collapsedGroups.add(group);
		}
	}

	handlePersonClick(person: Personnel): void {
		this.#modals.open('person-editor', { person });
	}

	setSelectedGroupId(groupId: string): void {
		this.selectedGroupId = this.isValidGroupId(groupId) ? groupId : '';
		this.#savePreferences({
			training: {
				selectedGroupId: this.selectedGroupId || null
			}
		});
	}

	setSelectedViewId(viewId: string | null): void {
		this.selectedViewId = viewId && this.savedViewIds.has(viewId) ? viewId : null;
		this.#savePreferences({
			training: {
				selectedViewId: this.selectedViewId
			}
		});
	}

	setViewMode(viewMode: TrainingMatrixViewMode): void {
		this.viewMode = viewMode;
		this.#savePreferences({
			training: {
				matrixViewMode: viewMode
			}
		});
	}

	dispose(): void {
		this.#disposed = true;
	}

	#isCurrentWorkspace(): boolean {
		return !this.#disposed && personnelTrainingsStore.orgId === this.orgId;
	}

	#isCurrentViewsWorkspace(): boolean {
		return !this.#disposed && trainingViewsStore.orgId === this.orgId;
	}

	/** Saves a view and applies it to the matrix. `'stale'` means the user left, so nothing was written. */
	async saveView(draft: { id: string | null; name: string; columnIds: string[] }): Promise<TrainingView | 'stale'> {
		if (!this.#isCurrentViewsWorkspace()) return 'stale';
		const { name, columnIds } = draft;
		let saved: TrainingView | null;
		if (draft.id === null) {
			saved = await trainingViewsStore.add({ name, columnIds, createdBy: '', createdAt: '', updatedAt: '' });
		} else {
			const updated = await trainingViewsStore.updateOrThrow(draft.id, { name, columnIds });
			saved = updated ? (trainingViewsStore.getById(draft.id) ?? null) : null;
		}
		if (!this.#isCurrentViewsWorkspace()) return 'stale';
		if (!saved) throw new Error('Failed to save view.');
		this.setSelectedViewId(saved.id);
		return saved;
	}

	async deleteView(id: string): Promise<'deleted' | 'failed' | 'stale'> {
		if (!this.#isCurrentViewsWorkspace()) return 'stale';
		this.#deletingViewIds.add(id);
		let result: Awaited<ReturnType<typeof trainingViewsStore.remove>>;
		try {
			result = await trainingViewsStore.remove(id);
		} finally {
			this.#deletingViewIds.delete(id);
		}
		if (!this.#isCurrentViewsWorkspace()) return 'stale';
		if (result === 'error') return 'failed';
		if (this.selectedViewId === id) this.setSelectedViewId(null);
		return 'deleted';
	}

	async handleSaveTraining(data: Omit<PersonnelTraining, 'id'>): Promise<void> {
		await personnelTrainingsStore.add(data);
	}

	async handleSaveTrainingBatch(records: TrainingBatchCompletionRecord[]): Promise<void> {
		if (!this.#isCurrentWorkspace()) return;
		try {
			const result = await recordTrainingCompletions(this.orgId, records);
			if (!this.#isCurrentWorkspace()) return;
			personnelTrainingsStore.addBatchResults(result.inserted, result.updated);
		} catch (error) {
			if (this.#isCurrentWorkspace()) throw error;
		}
	}

	async handleRemoveTraining(id: string, isCurrentEditor: () => boolean = () => true): Promise<void> {
		const isCurrent = () => this.#isCurrentWorkspace() && isCurrentEditor();
		if (!isCurrent()) return;
		const training = personnelTrainingsStore.getById(id);
		const result = await personnelTrainingsStore.remove(id);
		if (!isCurrent()) return;
		if (result === 'error') throw new Error('Could not remove training record. Try again.');
		if (result === 'approval_required' && training) {
			const person = this.personnel.find((p) => p.id === training.personnelId);
			const type = trainingTypesStore.items.find((t) => t.id === training.trainingTypeId);
			const desc = `${type?.name ?? 'Training'} record for ${person ? `${person.rank} ${person.lastName}` : 'unknown'}`;
			const submitted = await this.#submitRemovalRequest(
				this.orgId,
				'personnel_training',
				id,
				desc,
				`/org/${this.orgId}/training`,
				isCurrent
			);
			if (!isCurrent()) return;
			if (!submitted) throw new Error('Could not submit removal request. Try again.');
		}
	}

	async handleToggleExempt(typeId: string, personId: string, exempt: boolean): Promise<void> {
		const type = trainingTypesStore.items.find((t) => t.id === typeId);
		if (!type) return;
		const currentIds = type.exemptPersonnelIds;
		const updatedIds = exempt ? [...currentIds, personId] : currentIds.filter((id) => id !== personId);
		try {
			await trainingTypesStore.updateOrThrow(typeId, { exemptPersonnelIds: updatedIds });
		} catch (error) {
			if (!this.#isCurrentWorkspace()) return;
			const fallback = exempt ? 'Failed to mark exempt. Try again.' : 'Failed to remove exemption. Try again.';
			toastStore.error(rejectedRequestMessage(error, fallback));
		}
	}

	private applyUserPreferences(preferences?: { training?: TrainingPagePreferences }): void {
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

		const patch: NonNullable<TrainingPreferencesPatch['training']> = {};

		if (groupsLoaded && rosterLoaded && this.selectedGroupId && !this.isValidGroupId(this.selectedGroupId)) {
			this.selectedGroupId = '';
			patch.selectedGroupId = null;
		}

		if (
			viewsLoaded &&
			this.selectedViewId &&
			!this.#deletingViewIds.has(this.selectedViewId) &&
			!trainingViewsStore.items.some((view) => view.id === this.selectedViewId)
		) {
			this.selectedViewId = null;
			patch.selectedViewId = null;
		}

		if (Object.keys(patch).length > 0) {
			this.#savePreferences({ training: patch });
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

	private trainingRosterView(options: { groupFilter?: string } = {}): RosterReadModelView {
		if (rosterStore.orgId !== this.orgId) {
			return createRosterReadModel({
				personnel: [],
				groups: [],
				pinnedGroups: [],
				fallbackGroupName: this.orgName
			}).scoped(this.#org.scopeSet, { status: 'active', ...options });
		}

		return rosterStore
			.readModel({ fallbackGroupName: this.orgName })
			.scoped(this.#org.scopeSet, { status: 'active', ...options });
	}
}
