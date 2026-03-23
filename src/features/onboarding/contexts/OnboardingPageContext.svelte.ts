import { invalidate } from '$app/navigation';
import { subscriptionStore } from '$lib/stores/subscription.svelte';
import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';
import { onboardingTemplateStore } from '$features/onboarding/stores/onboardingTemplate.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { OrgContext } from '$lib/stores/orgContext.svelte';
import type { PersonnelOnboarding, OnboardingStepProgress } from '$features/onboarding/onboarding.types';
import type { Personnel } from '$lib/types';
import type { OverflowItem } from '$lib/components/ui/OverflowMenu.svelte';

// ── Modal IDs ─────────────────────────────────────────────────

export const MODAL_IDS = {
	templateManager: 'templateManager',
	startOnboarding: 'startOnboarding',
	report: 'report',
	assignTemplate: 'assignTemplate',
	cancelConfirm: 'cancelConfirm',
	switchTemplate: 'switchTemplate',
	completeConfirm: 'completeConfirm'
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
 * Training step completion is now server-derived (read-through cache pattern).
 * The server refreshes `step.completed` from personnel_trainings on every load.
 */
export function isTrainingStepComplete(step: OnboardingStepProgress): boolean {
	return step.completed;
}

/**
 * Calculates completed/total progress for an onboarding.
 * Only counts active steps. All step types use `step.completed` (server-derived for training/paperwork).
 */
export function getProgress(onboarding: PersonnelOnboarding): { completed: number; total: number } {
	let completed = 0;
	let total = 0;
	for (const step of onboarding.steps) {
		if (!step.active) continue;
		total++;
		if (step.completed) completed++;
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

export interface AssignTemplatePayload {
	onboardingId: string;
}

// ── Context class ─────────────────────────────────────────────

export class OnboardingPageContext {
	// Injected dependencies
	readonly #org: OrgContext;
	readonly modals: ModalRegistry;

	// UI state
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
	// Switch template state
	switchingTemplateId = $state<string | null>(null);
	switchTemplateSelected = $state('');
	switchingTemplate = $state(false);
	switchTemplateError = $state('');
	// Complete confirmation state
	completingId = $state<string | null>(null);
	completingIncompleteCount = $state(0);

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

	get existingOnboardingPersonnelIds(): string[] {
		return onboardingStore.activeList.map((o) => o.personnelId);
	}

	get filteredOnboardings(): PersonnelOnboarding[] {
		return onboardingStore.items.filter((o) => o.status === 'in_progress');
	}

	get historyUrl(): string {
		return `/org/${this.#org.orgId}/onboarding/history`;
	}

	get templatesUrl(): string {
		return `/org/${this.#org.orgId}/onboarding/templates`;
	}

	get overflowItems(): OverflowItem[] {
		const items: OverflowItem[] = [];
		items.push({ label: 'View Report', onclick: () => this.modals.open(MODAL_IDS.report) });
		if (this.canManageConfig) {
			items.push({
				label: 'Manage Templates',
				href: this.templatesUrl,
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

	getPersonGroupName(personnelId: string): string | null {
		const p = personnelStore.getById(personnelId);
		return p?.groupName || null;
	}

	getTemplateName(templateId: string | null): string {
		if (!templateId) return 'No template';
		const tmpl = onboardingTemplateStore.templates.find((t) => t.id === templateId);
		return tmpl?.name ?? 'Template deleted';
	}

	get trainingPageUrl(): string {
		return `/org/${this.#org.orgId}/training`;
	}

	isTrainingStepComplete(step: OnboardingStepProgress): boolean {
		return isTrainingStepComplete(step);
	}

	getTrainingTypeName(step: OnboardingStepProgress): string | null {
		if (step.stepType !== 'training' || !step.trainingTypeId) return null;
		const type = trainingTypesStore.items.find((t) => t.id === step.trainingTypeId);
		if (!type || type.name === step.stepName) return null;
		return type.name;
	}

	getProgress(onboarding: PersonnelOnboarding): { completed: number; total: number } {
		return getProgress(onboarding);
	}

	getPaperworkStageIndex(step: OnboardingStepProgress): number {
		return getPaperworkStageIndex(step);
	}

	formatTimestamp(isoStr: string): string {
		return formatTimestamp(isoStr);
	}

	// ── Event handlers ─────────────────────────────────────────

	async handleStartOnboarding(personnelId: string, templateId: string | null) {
		await onboardingStore.startOnboarding(personnelId, templateId);
		this.modals.close(MODAL_IDS.startOnboarding);
	}

	async handleAddPerson(data: Omit<Personnel, 'id'>): Promise<string | null> {
		const newPerson = await personnelStore.add(data);
		return newPerson?.id ?? null;
	}

	async handleToggleCheckbox(step: OnboardingStepProgress) {
		await onboardingStore.toggleCheckbox(step.id, !step.completed);
	}

	async handleStageClick(step: OnboardingStepProgress, stageName: string) {
		const stages = step.stages ?? [];
		if (!stages.includes(stageName)) return;
		await onboardingStore.advanceStage(step.id, stageName);
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
		await onboardingStore.addNote(step.id, text);
		this.noteInputs[step.id] = '';
	}

	async handleCancelOnboarding(id: string) {
		await onboardingStore.cancelOnboarding(id);
		this.cancellingId = null;
		this.modals.close(MODAL_IDS.cancelConfirm);
	}

	promptCompleteOnboarding(id: string) {
		const onboarding = onboardingStore.getById(id);
		if (!onboarding) return;
		const progress = this.getProgress(onboarding);
		const incompleteCount = progress.total - progress.completed;
		this.completingId = id;
		this.completingIncompleteCount = incompleteCount;
	}

	async confirmCompleteOnboarding() {
		if (!this.completingId) return;
		await onboardingStore.completeOnboarding(this.completingId);
		this.completingId = null;
		this.completingIncompleteCount = 0;
	}

	cancelComplete() {
		this.completingId = null;
		this.completingIncompleteCount = 0;
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

	openSwitchTemplate(onboardingId: string) {
		this.switchingTemplateId = onboardingId;
		this.switchTemplateSelected = onboardingTemplateStore.templates[0]?.id ?? '';
		this.switchTemplateError = '';
	}

	closeSwitchTemplate() {
		this.switchingTemplateId = null;
		this.switchTemplateError = '';
	}

	async handleSwitchTemplate() {
		if (!this.switchingTemplateId || !this.switchTemplateSelected) return;
		this.switchingTemplate = true;
		this.switchTemplateError = '';
		const result = await onboardingStore.switchTemplate(this.switchingTemplateId, this.switchTemplateSelected);
		this.switchingTemplate = false;
		if (result.success) {
			this.closeSwitchTemplate();
		} else {
			this.switchTemplateError = result.error ?? 'Failed to switch template';
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

	get trainingTypeNames(): Map<string, string> {
		return new Map(trainingTypesStore.items.map((t) => [t.id, t.name]));
	}
}
