import type { CriticalTasksSettings } from '$features/critical-tasks/criticalTasks.types';
import { createSettingsMemberAccessWorkspace } from './settingsMemberAccessWorkspace.svelte';
import type {
	OrganizationSettingsWorkspace,
	SettingsArchivedPersonnelRow,
	SettingsOwnershipTransferCandidate
} from './organizationSettingsWorkspaceModel';

export class SettingsPoliciesState {
	readonly #getWorkspace: () => OrganizationSettingsWorkspace;

	retentionMonths = $state(0);
	savedRetentionMonths = $state(0);
	warningWindowDays = $state(0);
	savedWarningWindowDays = $state(0);
	criticalTasksDefaultExpirationMonths = $state(0);
	savedCriticalTasksDefaultExpirationMonths = $state(0);
	criticalTasksExpiringSoonWarningDays = $state(0);
	savedCriticalTasksExpiringSoonWarningDays = $state(0);
	savingRetention = $state(false);
	savingWarningWindow = $state(false);
	savingCriticalTasks = $state(false);
	#syncedPolicySnapshot = $state('');

	constructor(workspace: OrganizationSettingsWorkspace | (() => OrganizationSettingsWorkspace)) {
		this.#getWorkspace = typeof workspace === 'function' ? workspace : () => workspace;
		this.syncFromWorkspace();
	}

	get #policies(): OrganizationSettingsWorkspace['sections']['policies'] {
		return this.#getWorkspace().sections.policies;
	}

	get archiveRetentionConstraints() {
		return this.#policies.archiveRetention.constraints;
	}

	get lossWarningConstraints() {
		return this.#policies.lossWarning.constraints;
	}

	get criticalTasksDefaultExpirationConstraints() {
		return this.#policies.criticalTasks.defaultExpirationConstraints;
	}

	get criticalTasksExpiringSoonWarningConstraints() {
		return this.#policies.criticalTasks.expiringSoonWarningConstraints;
	}

	get hasRetentionChanges(): boolean {
		return this.retentionMonths !== this.savedRetentionMonths;
	}

	get isRetentionValid(): boolean {
		const { min, max } = this.archiveRetentionConstraints;
		return this.retentionMonths >= min && this.retentionMonths <= max;
	}

	get hasLossWarningChanges(): boolean {
		return this.warningWindowDays !== this.savedWarningWindowDays;
	}

	get isLossWarningValid(): boolean {
		const { min, max } = this.lossWarningConstraints;
		return this.warningWindowDays >= min && this.warningWindowDays <= max;
	}

	get hasCriticalTasksChanges(): boolean {
		return (
			this.criticalTasksDefaultExpirationMonths !== this.savedCriticalTasksDefaultExpirationMonths ||
			this.criticalTasksExpiringSoonWarningDays !== this.savedCriticalTasksExpiringSoonWarningDays
		);
	}

	get isCriticalTasksValid(): boolean {
		const expiration = this.criticalTasksDefaultExpirationConstraints;
		const warning = this.criticalTasksExpiringSoonWarningConstraints;
		return (
			this.criticalTasksDefaultExpirationMonths >= expiration.min &&
			this.criticalTasksDefaultExpirationMonths <= expiration.max &&
			this.criticalTasksExpiringSoonWarningDays >= warning.min &&
			this.criticalTasksExpiringSoonWarningDays <= warning.max
		);
	}

	get criticalTasksSettings(): CriticalTasksSettings {
		return {
			defaultExpirationMonths: this.#policies.criticalTasks.savedDefaultExpirationMonths,
			expiringSoonWarningDays: this.#policies.criticalTasks.savedExpiringSoonWarningDays
		};
	}

	get hasUnsavedEdits(): boolean {
		return this.hasRetentionChanges || this.hasLossWarningChanges || this.hasCriticalTasksChanges;
	}

	get serverPolicySnapshot(): string {
		return JSON.stringify({
			retentionMonths: this.#policies.archiveRetention.savedMonths,
			warningWindowDays: this.#policies.lossWarning.savedDays,
			criticalTasksDefaultExpirationMonths: this.#policies.criticalTasks.savedDefaultExpirationMonths,
			criticalTasksExpiringSoonWarningDays: this.#policies.criticalTasks.savedExpiringSoonWarningDays
		});
	}

	syncFromWorkspace(): void {
		const snapshot = this.serverPolicySnapshot;
		if (snapshot === this.#syncedPolicySnapshot) return;
		if (this.#syncedPolicySnapshot && this.hasUnsavedEdits) return;

		this.retentionMonths = this.#policies.archiveRetention.savedMonths;
		this.savedRetentionMonths = this.#policies.archiveRetention.savedMonths;
		this.warningWindowDays = this.#policies.lossWarning.savedDays;
		this.savedWarningWindowDays = this.#policies.lossWarning.savedDays;
		this.criticalTasksDefaultExpirationMonths = this.#policies.criticalTasks.savedDefaultExpirationMonths;
		this.savedCriticalTasksDefaultExpirationMonths = this.#policies.criticalTasks.savedDefaultExpirationMonths;
		this.criticalTasksExpiringSoonWarningDays = this.#policies.criticalTasks.savedExpiringSoonWarningDays;
		this.savedCriticalTasksExpiringSoonWarningDays = this.#policies.criticalTasks.savedExpiringSoonWarningDays;
		this.#syncedPolicySnapshot = snapshot;
	}

	markRetentionSaved(): void {
		this.savedRetentionMonths = this.retentionMonths;
	}

	markLossWarningSaved(): void {
		this.savedWarningWindowDays = this.warningWindowDays;
	}

	markCriticalTasksSaved(): void {
		this.savedCriticalTasksDefaultExpirationMonths = this.criticalTasksDefaultExpirationMonths;
		this.savedCriticalTasksExpiringSoonWarningDays = this.criticalTasksExpiringSoonWarningDays;
	}
}

export class SettingsArchivedPersonnelState {
	readonly #getWorkspace: () => OrganizationSettingsWorkspace;

	confirmPermanentDelete = $state<{ id: string; name: string } | null>(null);
	permanentDeleteConfirmText = $state('');

	constructor(workspace: OrganizationSettingsWorkspace | (() => OrganizationSettingsWorkspace)) {
		this.#getWorkspace = typeof workspace === 'function' ? workspace : () => workspace;
	}

	get rows(): OrganizationSettingsWorkspace['sections']['archivedPersonnel']['rows'] {
		return this.#getWorkspace().sections.archivedPersonnel.rows;
	}

	get retention(): OrganizationSettingsWorkspace['sections']['archivedPersonnel']['retention'] {
		return this.#getWorkspace().sections.archivedPersonnel.retention;
	}

	get commands(): OrganizationSettingsWorkspace['sections']['archivedPersonnel']['commands'] {
		return this.#getWorkspace().sections.archivedPersonnel.commands;
	}

	openPermanentDeleteConfirmation(person: Pick<SettingsArchivedPersonnelRow, 'id' | 'displayName'>): void {
		this.confirmPermanentDelete = {
			id: person.id,
			name: person.displayName
		};
		this.permanentDeleteConfirmText = '';
	}

	clearPermanentDeleteConfirmation(): void {
		this.confirmPermanentDelete = null;
		this.permanentDeleteConfirmText = '';
	}

	get permanentDeleteConfirmMatches(): boolean {
		return this.permanentDeleteConfirmText.trim().replace(/\s+/g, ' ') === this.confirmPermanentDelete?.name;
	}
}

export class SettingsDataExportState {
	readonly #getWorkspace: () => OrganizationSettingsWorkspace;

	exportingOrgJson = $state(false);
	exportingOrgExcel = $state(false);
	exportError = $state('');
	exportSuccess = $state(false);

	constructor(workspace: OrganizationSettingsWorkspace | (() => OrganizationSettingsWorkspace)) {
		this.#getWorkspace = typeof workspace === 'function' ? workspace : () => workspace;
	}

	get section(): OrganizationSettingsWorkspace['sections']['dataExport'] {
		return this.#getWorkspace().sections.dataExport;
	}

	get exportInfo(): OrganizationSettingsWorkspace['sections']['dataExport']['exportInfo'] {
		return this.section.exportInfo;
	}

	get commands(): OrganizationSettingsWorkspace['sections']['dataExport']['commands'] {
		return this.section.commands;
	}

	get activity(): OrganizationSettingsWorkspace['sections']['dataExport']['activity'] {
		return this.section.activity;
	}

	get exportLimitReached(): boolean {
		return this.exportInfo.limitReached;
	}

	get isExporting(): boolean {
		return this.exportingOrgJson || this.exportingOrgExcel;
	}

	beginExport(format: 'json' | 'excel'): void {
		this.exportError = '';
		this.exportSuccess = false;
		this.exportingOrgJson = format === 'json';
		this.exportingOrgExcel = format === 'excel';
	}

	markExportFailed(message: string): void {
		this.exportError = message;
	}

	markExportSucceeded(): void {
		this.exportSuccess = true;
	}

	finishExport(): void {
		this.exportingOrgJson = false;
		this.exportingOrgExcel = false;
	}
}

export class SettingsDangerZoneState {
	readonly #getWorkspace: () => OrganizationSettingsWorkspace;

	showTransferConfirm = $state(false);
	transferTargetId = $state<string | null>(null);
	transferConfirmText = $state('');
	showDeleteConfirm = $state(false);
	deleteConfirmText = $state('');

	constructor(workspace: OrganizationSettingsWorkspace | (() => OrganizationSettingsWorkspace)) {
		this.#getWorkspace = typeof workspace === 'function' ? workspace : () => workspace;
	}

	get section(): OrganizationSettingsWorkspace['sections']['dangerZone'] {
		return this.#getWorkspace().sections.dangerZone;
	}

	get transferOwnershipCandidates(): SettingsOwnershipTransferCandidate[] {
		return this.section.transferOwnershipCandidates;
	}

	get selectedTransferCandidate(): SettingsOwnershipTransferCandidate | null {
		return this.transferOwnershipCandidates.find((candidate) => candidate.userId === this.transferTargetId) ?? null;
	}

	get transferConfirmMatches(): boolean {
		const email = this.selectedTransferCandidate?.email;
		return Boolean(email && this.transferConfirmText.trim().toLowerCase() === email.toLowerCase());
	}

	get transferCloseBlocked(): boolean {
		return this.transferConfirmText.trim() !== '';
	}

	get deleteConfirmMatches(): boolean {
		return (
			this.deleteConfirmText.trim().replace(/\s+/g, ' ') === this.section.deleteConfirmation.normalizedOrganizationName
		);
	}

	get deleteOrganizationCloseBlocked(): boolean {
		return this.deleteConfirmText.trim() !== '';
	}

	openTransferConfirmation(candidateId?: string | null): void {
		if (candidateId !== undefined) this.transferTargetId = candidateId;
		this.showTransferConfirm = true;
	}

	closeTransferConfirmation(): void {
		this.showTransferConfirm = false;
		this.transferConfirmText = '';
	}

	openDeleteConfirmation(): void {
		this.showDeleteConfirm = true;
	}

	closeDeleteConfirmation(): void {
		this.showDeleteConfirm = false;
		this.deleteConfirmText = '';
	}
}

export class SettingsWorkspaceState {
	readonly #getWorkspace: () => OrganizationSettingsWorkspace;

	members: ReturnType<typeof createSettingsMemberAccessWorkspace>;
	policies: SettingsPoliciesState;
	archivedPersonnel: SettingsArchivedPersonnelState;
	dataExport: SettingsDataExportState;
	dangerZone: SettingsDangerZoneState;

	constructor(workspace: OrganizationSettingsWorkspace | (() => OrganizationSettingsWorkspace)) {
		this.#getWorkspace = typeof workspace === 'function' ? workspace : () => workspace;
		this.members = createSettingsMemberAccessWorkspace(() => {
			const section = this.#getWorkspace().sections.members;
			return {
				members: section.rows,
				invitations: section.invitations,
				groups: section.groups,
				isOwner: this.#getWorkspace().currentMember.isOwner
			};
		});
		this.policies = new SettingsPoliciesState(() => this.#getWorkspace());
		this.archivedPersonnel = new SettingsArchivedPersonnelState(() => this.#getWorkspace());
		this.dataExport = new SettingsDataExportState(() => this.#getWorkspace());
		this.dangerZone = new SettingsDangerZoneState(() => this.#getWorkspace());
	}
}

export function createSettingsWorkspaceState(
	workspace: OrganizationSettingsWorkspace | (() => OrganizationSettingsWorkspace)
): SettingsWorkspaceState {
	return new SettingsWorkspaceState(workspace);
}
