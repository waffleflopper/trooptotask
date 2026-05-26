<script lang="ts">
	import { page } from '$app/stores';
	import { toastStore } from '$lib/stores/toast.svelte';
	import PoliciesSettingsSection from '../PoliciesSettingsSection.svelte';
	import { createSettingsWorkspaceState } from '../settingsWorkspaceState.svelte';

	let { data } = $props();

	const orgId = $derived($page.params.orgId);
	const settingsState = createSettingsWorkspaceState(() => data.workspace);
	const syncPoliciesFromWorkspace = () => settingsState.policies.syncFromWorkspace();

	$effect.pre(syncPoliciesFromWorkspace);

	async function saveSettings(body: Record<string, number | null>) {
		const res = await fetch(`/org/${orgId}/api/organization/settings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) throw new Error();
	}

	async function handleRetentionSave() {
		if (
			!settingsState.policies.hasRetentionChanges ||
			!settingsState.policies.isRetentionValid ||
			settingsState.policies.savingRetention
		)
			return;
		settingsState.policies.savingRetention = true;
		try {
			await saveSettings({ archiveRetentionMonths: settingsState.policies.retentionMonths });
			settingsState.policies.markRetentionSaved();
			toastStore.success('Retention policy saved');
		} catch {
			toastStore.error('Failed to save retention policy');
		} finally {
			settingsState.policies.savingRetention = false;
		}
	}

	async function handleLossWarningSave() {
		if (
			!settingsState.policies.hasLossWarningChanges ||
			!settingsState.policies.isLossWarningValid ||
			settingsState.policies.savingWarningWindow
		)
			return;
		settingsState.policies.savingWarningWindow = true;
		try {
			await saveSettings({ lossWarningWindowDays: settingsState.policies.warningWindowDays });
			settingsState.policies.markLossWarningSaved();
			toastStore.success('Warning window saved');
		} catch {
			toastStore.error('Failed to save warning window');
		} finally {
			settingsState.policies.savingWarningWindow = false;
		}
	}

	async function handleCriticalTasksSave() {
		if (
			!settingsState.policies.hasCriticalTasksChanges ||
			!settingsState.policies.isCriticalTasksValid ||
			settingsState.policies.savingCriticalTasks
		)
			return;
		settingsState.policies.savingCriticalTasks = true;
		try {
			await saveSettings({
				criticalTasksDefaultExpirationMonths: settingsState.policies.criticalTasksDefaultExpirationMonths,
				criticalTasksExpiringSoonWarningDays: settingsState.policies.criticalTasksExpiringSoonWarningDays
			});
			settingsState.policies.markCriticalTasksSaved();
			toastStore.success('Critical Tasks settings saved');
		} catch {
			toastStore.error('Failed to save Critical Tasks settings');
		} finally {
			settingsState.policies.savingCriticalTasks = false;
		}
	}
</script>

<PoliciesSettingsSection
	bind:retentionMonths={settingsState.policies.retentionMonths}
	bind:warningWindowDays={settingsState.policies.warningWindowDays}
	bind:criticalTasksDefaultExpirationMonths={settingsState.policies.criticalTasksDefaultExpirationMonths}
	bind:criticalTasksExpiringSoonWarningDays={settingsState.policies.criticalTasksExpiringSoonWarningDays}
	hasRetentionChanges={settingsState.policies.hasRetentionChanges}
	isRetentionValid={settingsState.policies.isRetentionValid}
	hasLossWarningChanges={settingsState.policies.hasLossWarningChanges}
	isLossWarningValid={settingsState.policies.isLossWarningValid}
	hasCriticalTasksChanges={settingsState.policies.hasCriticalTasksChanges}
	isCriticalTasksValid={settingsState.policies.isCriticalTasksValid}
	savingRetention={settingsState.policies.savingRetention}
	savingWarningWindow={settingsState.policies.savingWarningWindow}
	savingCriticalTasks={settingsState.policies.savingCriticalTasks}
	onSaveRetention={handleRetentionSave}
	onSaveLossWarning={handleLossWarningSave}
	onSaveCriticalTasks={handleCriticalTasksSave}
/>
