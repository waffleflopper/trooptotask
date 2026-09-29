<script lang="ts">
	import { page } from '$app/stores';
	import type { PageProps } from './$types';
	import { toastStore } from '$lib/stores/toast.svelte';
	import PoliciesSettingsSection from '../PoliciesSettingsSection.svelte';
	import { createSettingsPoliciesState } from '../settingsWorkspaceState.svelte';

	let { data }: PageProps = $props();

	const orgId = $derived($page.params.orgId);
	const policiesState = createSettingsPoliciesState(() => data.policiesSettings.sections.policies);
	const syncPoliciesFromSettings = () => policiesState.syncFromSettings();

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
</script>

<PoliciesSettingsSection
	bind:retentionMonths={policiesState.retentionMonths}
	bind:warningWindowDays={policiesState.warningWindowDays}
	hasRetentionChanges={policiesState.hasRetentionChanges}
	isRetentionValid={policiesState.isRetentionValid}
	hasLossWarningChanges={policiesState.hasLossWarningChanges}
	isLossWarningValid={policiesState.isLossWarningValid}
	savingRetention={policiesState.savingRetention}
	savingWarningWindow={policiesState.savingWarningWindow}
	onSaveRetention={handleRetentionSave}
	onSaveLossWarning={handleLossWarningSave}
/>
