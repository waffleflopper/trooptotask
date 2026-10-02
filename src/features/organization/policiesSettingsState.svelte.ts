import type { SettingsPoliciesSectionData } from './policiesSettingsTypes';

export class SettingsPoliciesState {
	readonly #getPolicies: () => SettingsPoliciesSectionData;

	retentionMonths = $state(0);
	savedRetentionMonths = $state(0);
	warningWindowDays = $state(0);
	savedWarningWindowDays = $state(0);
	savingRetention = $state(false);
	savingWarningWindow = $state(false);
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

	get hasUnsavedEdits(): boolean {
		return this.hasRetentionChanges || this.hasLossWarningChanges;
	}

	get serverPolicySnapshot(): string {
		return JSON.stringify({
			retentionMonths: this.#policies.archiveRetention.savedMonths,
			warningWindowDays: this.#policies.lossWarning.savedDays
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
		this.#syncedPolicySnapshot = snapshot;
	}

	markRetentionSaved(submittedMonths: number): void {
		this.savedRetentionMonths = Math.round(submittedMonths);
		if (this.retentionMonths === submittedMonths) this.retentionMonths = this.savedRetentionMonths;
	}

	markLossWarningSaved(submittedDays: number): void {
		this.savedWarningWindowDays = Math.round(submittedDays);
		if (this.warningWindowDays === submittedDays) this.warningWindowDays = this.savedWarningWindowDays;
	}
}

export function createSettingsPoliciesState(
	policies: SettingsPoliciesSectionData | (() => SettingsPoliciesSectionData)
): SettingsPoliciesState {
	return new SettingsPoliciesState(policies);
}
