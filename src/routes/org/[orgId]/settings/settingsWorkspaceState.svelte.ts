import type { CriticalTasksSettings } from '$features/critical-tasks/criticalTasks.types';
import { createSettingsMemberAccessWorkspace } from './settingsMemberAccessWorkspace.svelte';
import type { OrganizationSettingsWorkspace, SettingsArchivedPersonnelRow } from './organizationSettingsWorkspaceModel';

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
	}

	clearPermanentDeleteConfirmation(): void {
		this.confirmPermanentDelete = null;
	}
}

export class SettingsWorkspaceState {
	readonly #getWorkspace: () => OrganizationSettingsWorkspace;

	members: ReturnType<typeof createSettingsMemberAccessWorkspace>;
	policies: SettingsPoliciesState;
	archivedPersonnel: SettingsArchivedPersonnelState;

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
	}
}

export function createSettingsWorkspaceState(
	workspace: OrganizationSettingsWorkspace | (() => OrganizationSettingsWorkspace)
): SettingsWorkspaceState {
	return new SettingsWorkspaceState(workspace);
}
