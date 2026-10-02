import { toastStore } from '$lib/stores/toast.svelte';
import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';
import { onboardingTemplateStore } from '$features/onboarding/stores/onboardingTemplate.svelte';
import { createPersonnel } from '$features/personnel';
import { personnelScopeResource } from '$features/personnel/contracts';
import { rosterStore } from '$features/personnel';
import { groupsStore } from '$features/personnel';
import { createRosterReadModel, type RosterReadModelView } from '$features/personnel/contracts';
import { SvelteDate } from 'svelte/reactivity';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import type {
	PersonnelOnboarding,
	OnboardingStepProgress,
	OnboardingTemplate
} from '$features/onboarding/onboarding.types';
import type { Personnel } from '$features/personnel/contracts';
import { POLICY_ACTION_CATALOG, type FeatureLanePolicyAction, type PolicyResource } from '$lib/access/policyEvaluator';

const ONBOARDING_POLICY_ACTIONS = POLICY_ACTION_CATALOG.onboarding;

// ── Modal IDs ─────────────────────────────────────────────────

export const MODAL_IDS = {
	startOnboarding: 'startOnboarding',
	assignTemplate: 'assignTemplate',
	cancelConfirm: 'cancelConfirm'
} as const;

// ── Pure exported functions (testable) ───────────────────────

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
 * Formats an ISO timestamp string to a human-readable "Jan 15 at 2:30 PM" format.
 */
export function formatTimestamp(isoStr: string): string {
	const d = new SvelteDate(isoStr);
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const h = d.getHours();
	const m = String(d.getMinutes()).padStart(2, '0');
	const ampm = h >= 12 ? 'PM' : 'AM';
	const hour = h % 12 || 12;
	return `${months[d.getMonth()]} ${d.getDate()} at ${hour}:${m} ${ampm}`;
}

/**
 * Formats a personnel record as "RANK LastName, FirstName".
 */
export function getPersonDisplayName(personnelId: string, personnel: Personnel[]): string {
	const p = personnel.find((pr) => pr.id === personnelId);
	return p ? `${p.rank} ${p.lastName}, ${p.firstName}` : 'Unknown';
}

/**
 * Returns the group name for a personnel record, or null if unassigned.
 */
export function getPersonGroupDisplayName(personnelId: string, personnel: Personnel[]): string | null {
	const p = personnel.find((pr) => pr.id === personnelId);
	return p?.groupName || null;
}

/**
 * Returns the template name, or a fallback for null/deleted templates.
 */
export function getTemplateDisplayName(templateId: string | null, templates: OnboardingTemplate[]): string {
	if (!templateId) return 'No template';
	const tmpl = templates.find((t) => t.id === templateId);
	return tmpl?.name ?? 'Template deleted';
}

// ── Step type constants ───────────────────────────────────────

export const STEP_TYPE_LABELS: Record<string, string> = {
	training: 'Training',
	paperwork: 'Paperwork',
	checkbox: 'Checkbox'
};

// ── Context class ─────────────────────────────────────────────

interface OnboardingPageAccess {
	readonly orgId: string;
	readonly orgUrlSegment?: string;
	readonly scopeSet: ScopeSet;
	readonly affordanceForFeatureAction: (
		action: FeatureLanePolicyAction,
		resource?: PolicyResource
	) => { readonly allowed: boolean; readonly visible: boolean };
}

export class OnboardingPageContext {
	// Injected dependencies
	readonly #org: OnboardingPageAccess;
	readonly orgId: string;
	readonly modals: ModalRegistry;
	#disposed = false;

	// UI state
	cancellingId = $state<string | null>(null);
	resyncingId = $state<string | null>(null);
	resyncError = $state<string | null>(null);
	assigningTemplateId = $state<string | null>(null);
	assignTemplateSelected = $state('');
	assigningTemplate = $state(false);
	assignTemplateError = $state('');
	removingDeprecatedStepId = $state<string | null>(null);
	// Switch template state
	switchingTemplateId = $state<string | null>(null);
	switchTemplateSelected = $state('');
	switchingTemplate = $state(false);
	switchTemplateError = $state('');
	// Complete confirmation state
	completingId = $state<string | null>(null);
	completingIncompleteCount = $state(0);
	readonly #rosterView = $derived.by<RosterReadModelView>(() =>
		rosterStore.orgId !== this.#org.orgId
			? createRosterReadModel({ personnel: [] }).scoped(this.#org.scopeSet, { status: 'active' })
			: rosterStore.readModel().scoped(this.#org.scopeSet, { status: 'active' })
	);

	constructor(modals: ModalRegistry, org: OnboardingPageAccess) {
		this.modals = modals;
		this.#org = org;
		this.orgId = org.orgId;
	}

	// ── Permission flags (advisory feature policy) ─────────────

	get canManageWorkflows(): boolean {
		return this.#org.affordanceForFeatureAction(ONBOARDING_POLICY_ACTIONS.manageWorkflows, {
			kind: 'unscoped'
		}).visible;
	}

	get canViewOnboarding(): boolean {
		return this.#org.affordanceForFeatureAction(ONBOARDING_POLICY_ACTIONS.viewWorkflows, {
			kind: 'unscoped'
		}).visible;
	}

	get canManageConfig(): boolean {
		return this.#org.affordanceForFeatureAction(ONBOARDING_POLICY_ACTIONS.configureWorkflows, {
			kind: 'organization'
		}).visible;
	}

	get canAddPerson(): boolean {
		const resource = personnelScopeResource(this.#org.scopeSet);
		return (
			resource !== null &&
			this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.createRecords, resource).allowed
		);
	}

	get personnelCreationGroups() {
		return this.groups.filter(
			(group) =>
				this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.createRecords, {
					kind: 'group',
					groupId: group.id
				}).allowed
		);
	}

	get allowUnassignedPersonnel(): boolean {
		return this.#org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.createRecords, { kind: 'organization' })
			.allowed;
	}

	// ── Derived ────────────────────────────────────────────────

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
		return `/org/${this.#org.orgUrlSegment ?? this.#org.orgId}/onboarding/history`;
	}

	get templatesUrl(): string {
		return `/org/${this.#org.orgUrlSegment ?? this.#org.orgId}/onboarding/templates`;
	}

	// ── Helpers ────────────────────────────────────────────────

	getPersonName(personnelId: string): string {
		return this.rosterView.displayName(personnelId);
	}

	getPersonGroupName(personnelId: string): string | null {
		return this.rosterView.groupName(personnelId);
	}

	getPersonnelPolicyResource(personnelId: string): PolicyResource {
		const personnel = this.rosterView.getById(personnelId);
		return personnel?.groupId ? { kind: 'group', groupId: personnel.groupId } : { kind: 'organization' };
	}

	canManageOnboarding(onboarding: PersonnelOnboarding): boolean {
		return this.#org.affordanceForFeatureAction(
			ONBOARDING_POLICY_ACTIONS.manageWorkflows,
			this.getPersonnelPolicyResource(onboarding.personnelId)
		).visible;
	}

	canConfigureOnboarding(onboarding: PersonnelOnboarding): boolean {
		return this.#org.affordanceForFeatureAction(
			ONBOARDING_POLICY_ACTIONS.configureWorkflows,
			this.getPersonnelPolicyResource(onboarding.personnelId)
		).visible;
	}

	getTemplateName(templateId: string | null): string {
		return getTemplateDisplayName(templateId, onboardingTemplateStore.templates);
	}

	get trainingPageUrl(): string {
		return `/org/${this.#org.orgUrlSegment ?? this.#org.orgId}/training`;
	}

	getProgress(onboarding: PersonnelOnboarding): { completed: number; total: number } {
		return getProgress(onboarding);
	}

	#isCurrent(version: number): boolean {
		return (
			!this.#disposed &&
			this.orgId === this.#org.orgId &&
			this.orgId === onboardingStore.orgId &&
			version === onboardingStore.organizationVersion
		);
	}

	dispose() {
		this.#disposed = true;
	}

	// ── Event handlers ─────────────────────────────────────────

	async handleStartOnboarding(personnelId: string, startedAt: string, templateId: string | null): Promise<boolean> {
		const version = onboardingStore.organizationVersion;
		if (!this.#isCurrent(version)) return false;
		const result = await onboardingStore.startOnboarding(personnelId, startedAt, templateId);
		return this.#isCurrent(version) && result !== null;
	}

	async handleAddPerson(data: Omit<Personnel, 'id'>): Promise<string> {
		const newPerson = await createPersonnel(data);
		if (!newPerson)
			throw new Error('Personnel creation could not be confirmed. Reload the roster before trying again.');
		return newPerson.id;
	}

	async handleToggleCheckbox(step: OnboardingStepProgress) {
		const version = onboardingStore.organizationVersion;
		if (!this.#isCurrent(version)) return;
		const saved = await onboardingStore.toggleCheckbox(step.id, !step.completed);
		if (this.#isCurrent(version) && !saved) toastStore.error('Could not update this step. Try again.');
	}

	async handleStageClick(step: OnboardingStepProgress, stageName: string) {
		const stages = step.stages ?? [];
		if (!stages.includes(stageName)) return;
		const version = onboardingStore.organizationVersion;
		if (!this.#isCurrent(version)) return;
		const saved = await onboardingStore.advanceStage(step.id, stageName);
		if (this.#isCurrent(version) && !saved) toastStore.error('Could not update this stage. Try again.');
	}

	async handleCancelOnboarding(id: string) {
		const version = onboardingStore.organizationVersion;
		if (!this.#isCurrent(version)) return;
		const saved = await onboardingStore.cancelOnboarding(id);
		if (!this.#isCurrent(version)) return;
		if (!saved) {
			toastStore.error('Could not cancel onboarding. Try again.');
			return;
		}
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
		const version = onboardingStore.organizationVersion;
		if (!this.#isCurrent(version)) return;
		const saved = await onboardingStore.completeOnboarding(this.completingId);
		if (!this.#isCurrent(version)) return;
		if (!saved) {
			toastStore.error('Could not complete onboarding. Try again.');
			return;
		}
		this.completingId = null;
		this.completingIncompleteCount = 0;
	}

	cancelComplete() {
		this.completingId = null;
		this.completingIncompleteCount = 0;
	}

	async handleResync(onboardingId: string) {
		const version = onboardingStore.organizationVersion;
		if (!this.#isCurrent(version)) return;
		this.resyncingId = onboardingId;
		this.resyncError = null;
		const result = await onboardingStore.resync(onboardingId);
		if (!this.#isCurrent(version)) return;
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
		const version = onboardingStore.organizationVersion;
		if (!this.#isCurrent(version)) return;
		if (!this.assigningTemplateId || !this.assignTemplateSelected) return;
		this.assigningTemplate = true;
		this.assignTemplateError = '';
		const result = await onboardingStore.assignTemplate(this.assigningTemplateId, this.assignTemplateSelected);
		if (!this.#isCurrent(version)) return;
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
		const version = onboardingStore.organizationVersion;
		if (!this.#isCurrent(version)) return;
		if (!this.switchingTemplateId || !this.switchTemplateSelected) return;
		this.switchingTemplate = true;
		this.switchTemplateError = '';
		const result = await onboardingStore.switchTemplate(this.switchingTemplateId, this.switchTemplateSelected);
		if (!this.#isCurrent(version)) return;
		this.switchingTemplate = false;
		if (result.success) {
			this.closeSwitchTemplate();
		} else {
			this.switchTemplateError = result.error ?? 'Failed to switch template';
		}
	}

	async handleRemoveDeprecatedStep(stepId: string) {
		const version = onboardingStore.organizationVersion;
		if (!this.#isCurrent(version)) return;
		this.removingDeprecatedStepId = stepId;
		const saved = await onboardingStore.removeDeprecatedStep(stepId);
		if (!this.#isCurrent(version)) return;
		this.removingDeprecatedStepId = null;
		if (!saved) toastStore.error('Could not remove this step. Reload and try again.');
	}

	// ── Store accessors (for view) ─────────────────────────────

	get onboardings() {
		return onboardingStore.items;
	}

	get personnel() {
		return this.rosterView.flatPersonnel;
	}

	get groups() {
		return groupsStore.items;
	}

	get templates() {
		return onboardingTemplateStore.templates;
	}

	private get rosterView(): RosterReadModelView {
		return this.#rosterView;
	}
}
