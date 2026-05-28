<script lang="ts">
	import { page } from '$app/stores';
	import { toastStore } from '$lib/stores/toast.svelte';
	import PoliciesSettingsSection from '../PoliciesSettingsSection.svelte';
	import { createSettingsPoliciesState } from '../settingsWorkspaceState.svelte';

	let { data } = $props();

	const orgId = $derived($page.params.orgId);
	const policiesState = createSettingsPoliciesState(() => data.policiesSettings.sections.policies);
	const syncPoliciesFromSettings = () => policiesState.syncFromWorkspace();

	$effect.pre(syncPoliciesFromSettings);

	async function saveSettings(body: Record<string, number | null>) {
		const res = await fetch(`/org/${orgId}/api/organization/settings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) throw new Error();
	}

	async function handleRetentionSave() {
		if (!policiesState.hasRetentionChanges || !policiesState.isRetentionValid || policiesState.savingRetention) return;
		policiesState.savingRetention = true;
		try {
			await saveSettings({ archiveRetentionMonths: policiesState.retentionMonths });
			policiesState.markRetentionSaved();
			toastStore.success('Retention policy saved');
		} catch {
			toastStore.error('Failed to save retention policy');
		} finally {
			policiesState.savingRetention = false;
		}
	}

	async function handleLossWarningSave() {
		if (!policiesState.hasLossWarningChanges || !policiesState.isLossWarningValid || policiesState.savingWarningWindow)
			return;
		policiesState.savingWarningWindow = true;
		try {
			await saveSettings({ lossWarningWindowDays: policiesState.warningWindowDays });
			policiesState.markLossWarningSaved();
			toastStore.success('Warning window saved');
		} catch {
			toastStore.error('Failed to save warning window');
		} finally {
			policiesState.savingWarningWindow = false;
		}
	}

	async function handleCriticalTasksSave() {
		if (
			!policiesState.hasCriticalTasksChanges ||
			!policiesState.isCriticalTasksValid ||
			policiesState.savingCriticalTasks
		)
			return;
		policiesState.savingCriticalTasks = true;
		try {
			await saveSettings({
				criticalTasksDefaultExpirationMonths: policiesState.criticalTasksDefaultExpirationMonths,
				criticalTasksExpiringSoonWarningDays: policiesState.criticalTasksExpiringSoonWarningDays
			});
			policiesState.markCriticalTasksSaved();
			toastStore.success('Critical Tasks settings saved');
		} catch {
			toastStore.error('Failed to save Critical Tasks settings');
		} finally {
			policiesState.savingCriticalTasks = false;
		}
	}
</script>

<PoliciesSettingsSection
	bind:retentionMonths={policiesState.retentionMonths}
	bind:warningWindowDays={policiesState.warningWindowDays}
	bind:criticalTasksDefaultExpirationMonths={policiesState.criticalTasksDefaultExpirationMonths}
	bind:criticalTasksExpiringSoonWarningDays={policiesState.criticalTasksExpiringSoonWarningDays}
	hasRetentionChanges={policiesState.hasRetentionChanges}
	isRetentionValid={policiesState.isRetentionValid}
	hasLossWarningChanges={policiesState.hasLossWarningChanges}
	isLossWarningValid={policiesState.isLossWarningValid}
	hasCriticalTasksChanges={policiesState.hasCriticalTasksChanges}
	isCriticalTasksValid={policiesState.isCriticalTasksValid}
	savingRetention={policiesState.savingRetention}
	savingWarningWindow={policiesState.savingWarningWindow}
	savingCriticalTasks={policiesState.savingCriticalTasks}
	onSaveRetention={handleRetentionSave}
	onSaveLossWarning={handleLossWarningSave}
	onSaveCriticalTasks={handleCriticalTasksSave}
/>
