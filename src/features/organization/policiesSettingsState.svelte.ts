import type { SettingsPoliciesSectionData } from './policiesSettingsTypes';

export class SettingsPoliciesState {
	readonly #getPolicies: () => SettingsPoliciesSectionData;

	retentionMonths = $state(0);
	savedRetentionMonths = $state(0);
	warningWindowDays = $state(0);
	savedWarningWindowDays = $state(0);
	readinessGoalPercent = $state<number | null>(0);
	savedReadinessGoalPercent = $state(0);
	savingRetention = $state(false);
	savingWarningWindow = $state(false);
	savingReadinessGoal = $state(false);
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

	get readinessGoalConstraints() {
		return this.#policies.trainingReadinessGoal.constraints;
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

	get hasReadinessGoalChanges(): boolean {
		return this.readinessGoalPercent !== this.savedReadinessGoalPercent;
	}

	get isReadinessGoalValid(): boolean {
		const { min, max } = this.readinessGoalConstraints;
		const value = this.readinessGoalPercent;
		return value !== null && Number.isInteger(value) && value >= min && value <= max;
	}

	get hasUnsavedEdits(): boolean {
		return this.hasRetentionChanges || this.hasLossWarningChanges || this.hasReadinessGoalChanges;
	}

	get serverPolicySnapshot(): string {
		return JSON.stringify({
			retentionMonths: this.#policies.archiveRetention.savedMonths,
			warningWindowDays: this.#policies.lossWarning.savedDays,
			readinessGoalPercent: this.#policies.trainingReadinessGoal.savedPercent
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
		this.readinessGoalPercent = this.#policies.trainingReadinessGoal.savedPercent;
		this.savedReadinessGoalPercent = this.#policies.trainingReadinessGoal.savedPercent;
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

	markReadinessGoalSaved(submittedPercent: number): void {
		this.savedReadinessGoalPercent = submittedPercent;
	}
}

export function createSettingsPoliciesState(
	policies: SettingsPoliciesSectionData | (() => SettingsPoliciesSectionData)
): SettingsPoliciesState {
	return new SettingsPoliciesState(policies);
}
