<script lang="ts">
	import { onDestroy } from 'svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import PoliciesSettingsSection, { type PolicyKey } from './PoliciesSettingsSection.svelte';
	import { createSettingsPoliciesState } from './policiesSettingsState.svelte';
	import type { SettingsPoliciesSectionData } from './policiesSettingsTypes';

	let { orgUrlSegment, policies }: { orgUrlSegment: string; policies: SettingsPoliciesSectionData } = $props();

	let active = true;
	onDestroy(() => {
		active = false;
	});
	const policiesState = createSettingsPoliciesState(() => policies);
	let saveErrors = $state<Partial<Record<PolicyKey, string>>>({});
	const syncPoliciesFromSettings = () => policiesState.syncFromSettings();

	$effect.pre(syncPoliciesFromSettings);

	async function saveSettings(body: Record<string, number | null>) {
		const res = await fetch(`/org/${orgUrlSegment}/api/organization/settings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) throw new Error();
	}

	async function handleRetentionSave() {
		if (!policiesState.hasRetentionChanges || !policiesState.isRetentionValid || policiesState.savingRetention) return;
		const submittedMonths = policiesState.retentionMonths;
		policiesState.savingRetention = true;
		saveErrors.retention = undefined;
		try {
			await saveSettings({ archiveRetentionMonths: submittedMonths });
			if (!active) return;
			policiesState.markRetentionSaved(submittedMonths);
			toastStore.success('Retention policy saved');
		} catch {
			if (active) saveErrors.retention = 'Failed to save retention policy. Try again.';
		} finally {
			if (active) policiesState.savingRetention = false;
		}
	}

	async function handleLossWarningSave() {
		if (!policiesState.hasLossWarningChanges || !policiesState.isLossWarningValid || policiesState.savingWarningWindow)
			return;
		const submittedDays = policiesState.warningWindowDays;
		policiesState.savingWarningWindow = true;
		saveErrors.warning = undefined;
		try {
			await saveSettings({ lossWarningWindowDays: submittedDays });
			if (!active) return;
			policiesState.markLossWarningSaved(submittedDays);
			toastStore.success('Warning window saved');
		} catch {
			if (active) saveErrors.warning = 'Failed to save warning window. Try again.';
		} finally {
			if (active) policiesState.savingWarningWindow = false;
		}
	}

	async function handleReadinessGoalSave() {
		const submittedPercent = policiesState.readinessGoalPercent;
		if (
			!policiesState.hasReadinessGoalChanges ||
			!policiesState.isReadinessGoalValid ||
			policiesState.savingReadinessGoal ||
			submittedPercent === null
		)
			return;
		policiesState.savingReadinessGoal = true;
		saveErrors.goal = undefined;
		try {
			await saveSettings({ trainingReadinessGoalPercent: submittedPercent });
			if (!active) return;
			policiesState.markReadinessGoalSaved(submittedPercent);
			toastStore.success('Training readiness goal saved');
		} catch {
			if (active) saveErrors.goal = 'Failed to save training readiness goal. Try again.';
		} finally {
			if (active) policiesState.savingReadinessGoal = false;
		}
	}
</script>

<PoliciesSettingsSection
	bind:retentionMonths={policiesState.retentionMonths}
	bind:warningWindowDays={policiesState.warningWindowDays}
	bind:readinessGoalPercent={policiesState.readinessGoalPercent}
	hasRetentionChanges={policiesState.hasRetentionChanges}
	isRetentionValid={policiesState.isRetentionValid}
	hasLossWarningChanges={policiesState.hasLossWarningChanges}
	isLossWarningValid={policiesState.isLossWarningValid}
	hasReadinessGoalChanges={policiesState.hasReadinessGoalChanges}
	isReadinessGoalValid={policiesState.isReadinessGoalValid}
	savingRetention={policiesState.savingRetention}
	savingWarningWindow={policiesState.savingWarningWindow}
	savingReadinessGoal={policiesState.savingReadinessGoal}
	{saveErrors}
	onSaveRetention={handleRetentionSave}
	onSaveLossWarning={handleLossWarningSave}
	onSaveReadinessGoal={handleReadinessGoalSave}
/>
