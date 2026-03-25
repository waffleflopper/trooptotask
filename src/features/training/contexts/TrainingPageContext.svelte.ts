import { SvelteSet } from 'svelte/reactivity';
import { invalidate, goto } from '$app/navigation';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { subscriptionStore } from '$lib/stores/subscription.svelte';
import { getTrainingStats } from '$features/training/utils/trainingStatus';
import { groupAndSortPersonnel } from '$features/personnel/utils/personnelGrouping';
import { submitDeletionRequest } from '$lib/utils/deletionRequests';
import type { OrgContext } from '$lib/stores/orgContext.svelte';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { Personnel } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
import type { OverflowItem } from '$lib/components/ui/OverflowMenu.svelte';

// ---------------------------------------------------------------------------
// Page data shape (from +page.server.ts + layout)
// ---------------------------------------------------------------------------
export interface TrainingPageData {
	orgId: string;
	orgName: string;
	personnel?: Personnel[];
	groups?: Group[];
	permissions?: {
		canViewTraining?: boolean;
		canEditTraining?: boolean;
	} | null;
	trainingTypes?: TrainingType[];
}

// ---------------------------------------------------------------------------
// TrainingPageContext
// ---------------------------------------------------------------------------
export class TrainingPageContext {
	// ---- injected deps ----
	readonly #data: TrainingPageData;
	readonly #modals: ModalRegistry;
	readonly #org: OrgContext;

	// ---- mutable UI state ----
	selectedGroupId = $state<string>('');
	viewMode = $state<'alphabetical' | 'by-group'>('by-group');
	collapsedGroups = $state<SvelteSet<string>>(new SvelteSet());

	constructor(data: TrainingPageData, modals: ModalRegistry, org: OrgContext) {
		this.#data = data;
		this.#modals = modals;
		this.#org = org;
	}

	// ---- permission flags ----
	get canManageConfig(): boolean {
		return (this.#org.isOwner || this.#org.isAdmin || this.#org.isFullEditor) ?? false;
	}

	get readOnly(): boolean {
		return subscriptionStore.billingEnabled && subscriptionStore.isReadOnly;
	}

	get canViewTraining(): boolean {
		return this.#data.permissions?.canViewTraining ?? true;
	}

	get canEditTraining(): boolean {
		return this.#data.permissions?.canEditTraining ?? false;
	}

	// ---- data accessors ----
	get orgId(): string {
		return this.#data.orgId;
	}

	get orgName(): string {
		return this.#data.orgName;
	}

	get personnel(): Personnel[] {
		return this.#data.personnel ?? [];
	}

	get groups(): Group[] {
		return this.#data.groups ?? [];
	}

	// ---- derived: roles ----
	get availableRoles(): string[] {
		return [...new SvelteSet(this.personnel.map((p) => p.clinicRole))].filter(Boolean).sort() as string[];
	}

	// ---- derived: filtered/sorted personnel ----
	get basePersonnel(): Personnel[] {
		return this.selectedGroupId ? this.personnel.filter((p) => p.groupId === this.selectedGroupId) : this.personnel;
	}

	get filteredPersonnel(): Personnel[] {
		return [...this.basePersonnel].sort((a, b) => {
			const lastNameDiff = a.lastName.localeCompare(b.lastName);
			if (lastNameDiff !== 0) return lastNameDiff;
			return a.firstName.localeCompare(b.firstName);
		});
	}

	get groupOrder(): string[] {
		return this.groups.map((g) => g.name);
	}

	get personnelByGroup() {
		return groupAndSortPersonnel(this.basePersonnel, {
			groupOrder: this.groupOrder,
			fallbackGroupName: this.orgName
		});
	}

	// ---- derived: stats ----
	get stats() {
		return getTrainingStats(this.filteredPersonnel, trainingTypesStore.items, personnelTrainingsStore.items);
	}

	// ---- derived: overflow menu ----
	get trainingOverflowItems(): OverflowItem[] {
		const items: OverflowItem[] = [];
		items.push({ label: 'Sign-In Rosters', onclick: () => this.#modals.open('sign-in-rosters') });
		items.push({ label: 'Reports', onclick: () => goto(`/org/${this.orgId}/training/reports`) });
		if (this.canManageConfig) {
			items.push({
				label: 'Bulk Import',
				onclick: () => this.#modals.open('bulk-import'),
				divider: true,
				disabled: this.readOnly
			});
			items.push({
				label: 'Manage Types',
				onclick: () => goto(`/org/${this.orgId}/training/types`)
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

	// ---- async handlers ----
	async handleSaveTraining(data: Omit<PersonnelTraining, 'id'>): Promise<void> {
		await personnelTrainingsStore.add(data);
	}

	async handleRemoveTraining(id: string): Promise<void> {
		const training = personnelTrainingsStore.getById(id);
		const result = await personnelTrainingsStore.remove(id);
		if (result === 'approval_required' && training) {
			const person = this.personnel.find((p) => p.id === training.personnelId);
			const type = trainingTypesStore.items.find((t) => t.id === training.trainingTypeId);
			const desc = `${type?.name ?? 'Training'} record for ${person ? `${person.rank} ${person.lastName}` : 'unknown'}`;
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
		await invalidate('app:training-data');
		this.#modals.close('bulk-import');
	}

	// ---- store hydration ----
	hydrateStores(): void {
		// trainingTypes already hydrated by layout; personnelTrainings hydrated by training layout
		// This is a no-op hook for any page-level hydration needed in the future
	}
}
