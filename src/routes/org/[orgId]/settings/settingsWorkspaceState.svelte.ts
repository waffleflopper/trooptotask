import type { CriticalTasksSettings } from '$features/critical-tasks/criticalTasks.types';
import type {
	DangerSettingsData,
	SettingsArchivedPersonnelRow,
	SettingsArchivesSectionData,
	SettingsDangerSectionData,
	SettingsExportsSectionData,
	SettingsOwnershipTransferCandidate,
	SettingsPoliciesSectionData
} from './settingsSectionTypes';

export class SettingsPoliciesState {
	readonly #getPolicies: () => SettingsPoliciesSectionData;

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

	constructor(policies: SettingsPoliciesSectionData | (() => SettingsPoliciesSectionData)) {
		this.#getPolicies = typeof policies === 'function' ? policies : () => policies;
		this.syncFromSettings();
	}

	get #policies(): SettingsPoliciesSectionData {
		return this.#getPolicies();
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

	syncFromSettings(): void {
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
	readonly #getSection: () => SettingsArchivesSectionData;

	confirmPermanentDelete = $state<{ id: string; name: string } | null>(null);
	permanentDeleteConfirmText = $state('');

	constructor(section: SettingsArchivesSectionData | (() => SettingsArchivesSectionData)) {
		this.#getSection = typeof section === 'function' ? section : () => section;
	}

	get rows(): SettingsArchivesSectionData['rows'] {
		return this.#getSection().rows;
	}

	get retention(): SettingsArchivesSectionData['retention'] {
		return this.#getSection().retention;
	}

	get commands(): SettingsArchivesSectionData['commands'] {
		return this.#getSection().commands;
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
	readonly #getSection: () => SettingsExportsSectionData;

	exportingOrgJson = $state(false);
	exportingOrgExcel = $state(false);
	exportError = $state('');
	exportSuccess = $state(false);

	constructor(section: SettingsExportsSectionData | (() => SettingsExportsSectionData)) {
		this.#getSection = typeof section === 'function' ? section : () => section;
	}

	get section(): SettingsExportsSectionData {
		return this.#getSection();
	}

	get exportInfo(): SettingsExportsSectionData['exportInfo'] {
		return this.section.exportInfo;
	}

	get commands(): SettingsExportsSectionData['commands'] {
		return this.section.commands;
	}

	get activity(): SettingsExportsSectionData['activity'] {
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
	readonly #getSettings: () => DangerSettingsData;

	showTransferConfirm = $state(false);
	transferTargetId = $state<string | null>(null);
	transferConfirmText = $state('');
	showDeleteConfirm = $state(false);
	deleteConfirmText = $state('');

	constructor(settings: DangerSettingsData | (() => DangerSettingsData)) {
		this.#getSettings = typeof settings === 'function' ? settings : () => settings;
	}

	get section(): SettingsDangerSectionData {
		return this.#getSettings().sections.dangerZone;
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

export function createSettingsDangerZoneState(
	settings: DangerSettingsData | (() => DangerSettingsData)
): SettingsDangerZoneState {
	return new SettingsDangerZoneState(settings);
}

export function createSettingsPoliciesState(
	policies: SettingsPoliciesSectionData | (() => SettingsPoliciesSectionData)
): SettingsPoliciesState {
	return new SettingsPoliciesState(policies);
}

export function createSettingsArchivedPersonnelState(
	section: SettingsArchivesSectionData | (() => SettingsArchivesSectionData)
): SettingsArchivedPersonnelState {
	return new SettingsArchivedPersonnelState(section);
}

export function createSettingsDataExportState(
	section: SettingsExportsSectionData | (() => SettingsExportsSectionData)
): SettingsDataExportState {
	return new SettingsDataExportState(section);
}
