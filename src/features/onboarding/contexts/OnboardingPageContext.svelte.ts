import { invalidate } from '$app/navigation';
import { subscriptionStore } from '$lib/stores/subscription.svelte';
import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';
import { onboardingTemplateStore } from '$features/onboarding/stores/onboardingTemplate.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { OrgContext } from '$lib/stores/orgContext.svelte';
import type { Personnel } from '$lib/types';
import type { PersonnelOnboarding, OnboardingStepProgress } from '$features/onboarding/onboarding.types';
import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
import type { OverflowItem } from '$lib/components/ui/OverflowMenu.svelte';

// ── Modal IDs ─────────────────────────────────────────────────

export const MODAL_IDS = {
	templateManager: 'templateManager',
	startOnboarding: 'startOnboarding',
	report: 'report',
	assignTemplate: 'assignTemplate',
	cancelConfirm: 'cancelConfirm',
	trainingRecord: 'trainingRecord'
} as const;

// ── Pure exported functions (testable) ───────────────────────

/**
 * A step is deprecated when it has a templateStepId that no longer exists
 * in any known template step. Legacy steps (templateStepId === null) are never deprecated.
 */
export function isStepDeprecated(step: OnboardingStepProgress, knownTemplateStepIds: string[]): boolean {
	if (step.templateStepId === null) return false;
	return !knownTemplateStepIds.includes(step.templateStepId);
}

/**
 * Determines whether a training step counts as complete.
 * Accepts plain arrays so it can be unit-tested without store singletons.
 */
export function isTrainingStepComplete(
	step: OnboardingStepProgress,
	personnelId: string,
	trainingTypes: TrainingType[],
	personnelTrainings: PersonnelTraining[]
): boolean {
	if (!step.trainingTypeId) return false;

	const type = trainingTypes.find((t) => t.id === step.trainingTypeId);

	// Exempt counts as complete for onboarding
	if (type && type.canBeExempted && type.exemptPersonnelIds.includes(personnelId)) {
		return true;
	}

	const training = personnelTrainings.find(
		(t) => t.personnelId === personnelId && t.trainingTypeId === step.trainingTypeId
	);
	if (!training) return false;

	// Never-expires: any record existing means complete
	if (type && type.expirationMonths === null && !type.expirationDateOnly) {
		return true;
	}

	// Has an expiration date — check if still valid
	if (training.expirationDate) {
		return new Date(training.expirationDate) >= new Date();
	}
	return training.completionDate !== null;
}

/**
 * Calculates completed/total progress for an onboarding, excluding deprecated steps.
 */
export function getProgress(
	onboarding: PersonnelOnboarding,
	knownTemplateStepIds: string[],
	trainingTypes: TrainingType[],
	personnelTrainings: PersonnelTraining[]
): { completed: number; total: number } {
	let completed = 0;
	let total = 0;
	for (const step of onboarding.steps) {
		if (isStepDeprecated(step, knownTemplateStepIds)) continue;
		total++;
		if (step.stepType === 'training') {
			if (isTrainingStepComplete(step, onboarding.personnelId, trainingTypes, personnelTrainings)) completed++;
		} else if (step.stepType === 'paperwork') {
			const stages = step.stages ?? [];
			if (stages.length > 0 && step.currentStage === stages[stages.length - 1]) completed++;
			else if (step.completed) completed++;
		} else {
			if (step.completed) completed++;
		}
	}
	return { completed, total };
}

/**
 * Returns the 0-based index of the current paperwork stage.
 */
export function getPaperworkStageIndex(step: OnboardingStepProgress): number {
	const stages = step.stages ?? [];
	if (!step.currentStage) return 0;
	const idx = stages.indexOf(step.currentStage);
	return idx >= 0 ? idx : 0;
}

/**
 * Formats an ISO timestamp string to a human-readable "Jan 15 at 2:30 PM" format.
 */
export function formatTimestamp(isoStr: string): string {
	const d = new Date(isoStr);
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const h = d.getHours();
	const m = String(d.getMinutes()).padStart(2, '0');
	const ampm = h >= 12 ? 'PM' : 'AM';
	const hour = h % 12 || 12;
	return `${months[d.getMonth()]} ${d.getDate()} at ${hour}:${m} ${ampm}`;
}

/**
 * Filters onboardings by the active/all toggle.
 */
export function filterOnboardings(onboardings: PersonnelOnboarding[], filter: 'active' | 'all'): PersonnelOnboarding[] {
	if (filter === 'active') return onboardings.filter((o) => o.status === 'in_progress');
	return onboardings;
}

// ── Step type constants ───────────────────────────────────────

export const STEP_TYPE_COLORS: Record<string, string> = {
	training: '#3b82f6',
	paperwork: '#f59e0b',
	checkbox: '#6b7280'
};

export const STEP_TYPE_LABELS: Record<string, string> = {
	training: 'Training',
	paperwork: 'Paperwork',
	checkbox: 'Checkbox'
};

export const STATUS_COLORS: Record<string, string> = {
	in_progress: '#3b82f6',
	completed: '#22c55e',
	cancelled: '#6b7280'
};

export const STATUS_LABELS: Record<string, string> = {
	in_progress: 'In Progress',
	completed: 'Completed',
	cancelled: 'Cancelled'
};

// ── Payload types for modals ──────────────────────────────────

export interface TrainingRecordPayload {
	person: Personnel;
	trainingType: TrainingType;
	existingTraining: PersonnelTraining | undefined;
	onboardingId: string;
}

export interface AssignTemplatePayload {
	onboardingId: string;
}

// ── Context class ─────────────────────────────────────────────

export class OnboardingPageContext {
	// Injected dependencies
	readonly #org: OrgContext;
	readonly modals: ModalRegistry;

	// UI state
	showFilter = $state<'active' | 'all'>('active');
	expandedOnboardingId = $state<string | null>(null);
	cancellingId = $state<string | null>(null);
	resyncingId = $state<string | null>(null);
	resyncError = $state<string | null>(null);
	assigningTemplateId = $state<string | null>(null);
	assignTemplateSelected = $state('');
	assigningTemplate = $state(false);
	assignTemplateError = $state('');
	removingDeprecatedStepId = $state<string | null>(null);
	noteInputs = $state<Record<string, string>>({});
	expandedNotes = $state<Set<string>>(new Set());

	constructor(modals: ModalRegistry, org: OrgContext) {
		this.modals = modals;
		this.#org = org;
	}

	// ── Permission flags (derived from OrgContext) ─────────────

	get canEditOnboarding(): boolean {
		return this.#org.permissions?.canEditOnboarding ?? false;
	}

	get canViewOnboarding(): boolean {
		return this.#org.permissions?.canViewOnboarding ?? false;
	}

	get canManageConfig(): boolean {
		return this.#org.isOwner || this.#org.isAdmin || this.#org.isFullEditor;
	}

	// ── Derived ────────────────────────────────────────────────

	get readOnly() {
		return subscriptionStore.billingEnabled && subscriptionStore.isReadOnly;
	}

	get hasTemplateSteps() {
		return onboardingTemplateStore.allSteps.length > 0;
	}

	get knownTemplateStepIds(): string[] {
		return onboardingTemplateStore.allSteps.map((s) => s.id);
	}

	get existingOnboardingPersonnelIds(): string[] {
		return onboardingStore.activeList.map((o) => o.personnelId);
	}

	get filteredOnboardings(): PersonnelOnboarding[] {
		return filterOnboardings(onboardingStore.items, this.showFilter);
	}

	get overflowItems(): OverflowItem[] {
		const items: OverflowItem[] = [];
		items.push({ label: 'View Report', onclick: () => this.modals.open(MODAL_IDS.report) });
		if (this.canManageConfig) {
			items.push({
				label: 'Manage Templates',
				onclick: () => this.modals.open(MODAL_IDS.templateManager),
				disabled: this.readOnly
			});
		}
		return items;
	}

	// ── Helpers ────────────────────────────────────────────────

	getPersonName(personnelId: string): string {
		const p = personnelStore.getById(personnelId);
		return p ? `${p.rank} ${p.lastName}, ${p.firstName}` : 'Unknown';
	}

	isStepDeprecated(step: OnboardingStepProgress): boolean {
		return isStepDeprecated(step, this.knownTemplateStepIds);
	}

	isTrainingStepComplete(step: OnboardingStepProgress, personnelId: string): boolean {
		return isTrainingStepComplete(step, personnelId, trainingTypesStore.items, personnelTrainingsStore.items);
	}

	getProgress(onboarding: PersonnelOnboarding): { completed: number; total: number } {
		return getProgress(onboarding, this.knownTemplateStepIds, trainingTypesStore.items, personnelTrainingsStore.items);
	}

	getPaperworkStageIndex(step: OnboardingStepProgress): number {
		return getPaperworkStageIndex(step);
	}

	formatTimestamp(isoStr: string): string {
		return formatTimestamp(isoStr);
	}

	// ── Event handlers ─────────────────────────────────────────

	async checkAutoComplete(onboardingId: string) {
		const onboarding = onboardingStore.getById(onboardingId);
		if (!onboarding || onboarding.status !== 'in_progress') return;
		const progress = this.getProgress(onboarding);
		if (progress.total > 0 && progress.completed === progress.total) {
			await onboardingStore.completeOnboarding(onboardingId);
		}
	}

	async handleStartOnboarding(personnelId: string, startedAt: string, templateId: string | null) {
		await onboardingStore.startOnboarding(personnelId, startedAt, templateId);
		this.modals.close(MODAL_IDS.startOnboarding);
	}

	async handleAddPerson(data: Omit<Personnel, 'id'>): Promise<string | null> {
		const newPerson = await personnelStore.add(data);
		return newPerson?.id ?? null;
	}

	async handleToggleCheckbox(step: OnboardingStepProgress) {
		await onboardingStore.updateStepProgress(step.id, { completed: !step.completed });
		const onboarding = onboardingStore.items.find((o) => o.steps.some((s) => s.id === step.id));
		if (onboarding) await this.checkAutoComplete(onboarding.id);
	}

	async handleAdvanceStage(step: OnboardingStepProgress) {
		const stages = step.stages ?? [];
		const currentIndex = stages.indexOf(step.currentStage ?? '');
		if (currentIndex < stages.length - 1) {
			const nextStage = stages[currentIndex + 1];
			const isLast = currentIndex + 1 === stages.length - 1;
			await onboardingStore.updateStepProgress(step.id, { currentStage: nextStage, completed: isLast });
			if (isLast) {
				const onboarding = onboardingStore.items.find((o) => o.steps.some((s) => s.id === step.id));
				if (onboarding) await this.checkAutoComplete(onboarding.id);
			}
		}
	}

	async handleRetreatStage(step: OnboardingStepProgress) {
		const stages = step.stages ?? [];
		const currentIndex = stages.indexOf(step.currentStage ?? '');
		if (currentIndex > 0) {
			await onboardingStore.updateStepProgress(step.id, {
				currentStage: stages[currentIndex - 1],
				completed: false
			});
		}
	}

	toggleNotes(stepId: string) {
		const newSet = new Set(this.expandedNotes);
		if (newSet.has(stepId)) newSet.delete(stepId);
		else newSet.add(stepId);
		this.expandedNotes = newSet;
	}

	async handleAddNote(step: OnboardingStepProgress) {
		const text = this.noteInputs[step.id]?.trim();
		if (!text) return;
		const newNote = { text, timestamp: new Date().toISOString() };
		const updatedNotes = [newNote, ...step.notes];
		await onboardingStore.updateStepProgress(step.id, { notes: updatedNotes });
		this.noteInputs[step.id] = '';
	}

	handleTrainingStepClick(step: OnboardingStepProgress, onboarding: PersonnelOnboarding) {
		if (!step.trainingTypeId) return;
		const person = personnelStore.getById(onboarding.personnelId);
		const trainingType = trainingTypesStore.getById(step.trainingTypeId);
		if (!person || !trainingType) return;
		const existingTraining = personnelTrainingsStore.getByPersonnelAndType(person.id, trainingType.id);
		const payload: TrainingRecordPayload = { person, trainingType, existingTraining, onboardingId: onboarding.id };
		this.modals.open(MODAL_IDS.trainingRecord, payload);
	}

	async handleTrainingSave(trainingData: Omit<PersonnelTraining, 'id'>) {
		await personnelTrainingsStore.add(trainingData);
		const payload = this.modals.payload<TrainingRecordPayload>(MODAL_IDS.trainingRecord);
		if (payload) await this.checkAutoComplete(payload.onboardingId);
		this.modals.close(MODAL_IDS.trainingRecord);
		invalidate('app:onboarding-data');
	}

	async handleTrainingRemove(id: string) {
		await personnelTrainingsStore.remove(id);
		this.modals.close(MODAL_IDS.trainingRecord);
		invalidate('app:onboarding-data');
	}

	async handleTrainingToggleExempt(exempt: boolean) {
		const payload = this.modals.payload<TrainingRecordPayload>(MODAL_IDS.trainingRecord);
		if (!payload) return;
		const { trainingType, person, onboardingId } = payload;
		const updatedIds = exempt
			? [...trainingType.exemptPersonnelIds, person.id]
			: trainingType.exemptPersonnelIds.filter((id) => id !== person.id);
		await trainingTypesStore.update(trainingType.id, { exemptPersonnelIds: updatedIds });
		await this.checkAutoComplete(onboardingId);
		this.modals.close(MODAL_IDS.trainingRecord);
		invalidate('app:onboarding-data');
	}

	async handleCancelOnboarding(id: string) {
		await onboardingStore.cancelOnboarding(id);
		this.cancellingId = null;
		this.modals.close(MODAL_IDS.cancelConfirm);
	}

	async handleCompleteOnboarding(id: string) {
		await onboardingStore.completeOnboarding(id);
	}

	toggleExpand(id: string) {
		this.expandedOnboardingId = this.expandedOnboardingId === id ? null : id;
	}

	async handleResync(onboardingId: string) {
		this.resyncingId = onboardingId;
		this.resyncError = null;
		const result = await onboardingStore.resync(onboardingId);
		this.resyncingId = null;
		if (!result.success) {
			this.resyncError = result.error ?? 'Re-sync failed';
		}
	}

	openAssignTemplate(onboardingId: string) {
		this.assigningTemplateId = onboardingId;
		this.assignTemplateSelected = onboardingTemplateStore.templates[0]?.id ?? '';
		this.assignTemplateError = '';
		this.modals.open(MODAL_IDS.assignTemplate, { onboardingId });
	}

	closeAssignTemplate() {
		this.assigningTemplateId = null;
		this.assignTemplateError = '';
		this.modals.close(MODAL_IDS.assignTemplate);
	}

	async handleAssignTemplate() {
		if (!this.assigningTemplateId || !this.assignTemplateSelected) return;
		this.assigningTemplate = true;
		this.assignTemplateError = '';
		const result = await onboardingStore.assignTemplate(this.assigningTemplateId, this.assignTemplateSelected);
		this.assigningTemplate = false;
		if (result.success) {
			this.closeAssignTemplate();
		} else {
			this.assignTemplateError = result.error ?? 'Failed to assign template';
		}
	}

	async handleRemoveDeprecatedStep(stepId: string) {
		this.removingDeprecatedStepId = stepId;
		await onboardingStore.removeDeprecatedStep(stepId);
		this.removingDeprecatedStepId = null;
	}

	// ── Store accessors (for view) ─────────────────────────────

	get onboardings() {
		return onboardingStore.items;
	}

	get personnel() {
		return personnelStore.items;
	}

	get groups() {
		return groupsStore.items;
	}

	get templates() {
		return onboardingTemplateStore.templates;
	}

	get trainingTypes() {
		return trainingTypesStore.items;
	}

	get personnelTrainings() {
		return personnelTrainingsStore.items;
	}
}
