<script lang="ts">
	import { page } from '$app/stores';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { Toolbar, ToolbarMetaItem } from '$lib/components/ui/toolbar';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { CriticalTasksSettings } from '$features/critical-tasks/criticalTasks.types';

	let { data } = $props();
	const orgId = $derived($page.params.orgId);
	const serverRetention = $derived(data.retentionMonths);
	const serverWarningWindow = $derived(data.lossWarningWindowDays);
	const serverCriticalTasksSettings = $derived(data.criticalTasksSettings as CriticalTasksSettings);

	let retentionMonths = $state(0);
	let savedRetentionMonths = $state(0);
	let warningWindowDays = $state(0);
	let savedWarningWindowDays = $state(0);
	let criticalTasksDefaultExpirationMonths = $state(0);
	let savedCriticalTasksDefaultExpirationMonths = $state(0);
	let criticalTasksExpiringSoonWarningDays = $state(0);
	let savedCriticalTasksExpiringSoonWarningDays = $state(0);
	let savingRetention = $state(false);
	let savingWarningWindow = $state(false);
	let savingCriticalTasks = $state(false);
	const hasRetentionChanges = $derived(retentionMonths !== savedRetentionMonths);
	const isRetentionValid = $derived(retentionMonths >= 1 && retentionMonths <= 120);
	const hasLossWarningChanges = $derived(warningWindowDays !== savedWarningWindowDays);
	const isLossWarningValid = $derived(warningWindowDays >= 1 && warningWindowDays <= 365);
	const hasCriticalTasksChanges = $derived(
		criticalTasksDefaultExpirationMonths !== savedCriticalTasksDefaultExpirationMonths ||
			criticalTasksExpiringSoonWarningDays !== savedCriticalTasksExpiringSoonWarningDays
	);
	const isCriticalTasksValid = $derived(
		criticalTasksDefaultExpirationMonths >= 1 &&
			criticalTasksDefaultExpirationMonths <= 120 &&
			criticalTasksExpiringSoonWarningDays >= 1 &&
			criticalTasksExpiringSoonWarningDays <= 365
	);
	const hasPendingChanges = $derived(hasRetentionChanges || hasLossWarningChanges || hasCriticalTasksChanges);

	$effect.pre(() => {
		retentionMonths = serverRetention;
		savedRetentionMonths = serverRetention;
		warningWindowDays = serverWarningWindow;
		savedWarningWindowDays = serverWarningWindow;
		criticalTasksDefaultExpirationMonths = serverCriticalTasksSettings.defaultExpirationMonths;
		savedCriticalTasksDefaultExpirationMonths = serverCriticalTasksSettings.defaultExpirationMonths;
		criticalTasksExpiringSoonWarningDays = serverCriticalTasksSettings.expiringSoonWarningDays;
		savedCriticalTasksExpiringSoonWarningDays = serverCriticalTasksSettings.expiringSoonWarningDays;
	});

	async function saveSettings(body: Record<string, number | null>) {
		const res = await fetch(`/org/${orgId}/api/organization/settings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) throw new Error();
	}

	async function handleRetentionSave() {
		if (!hasRetentionChanges || !isRetentionValid || savingRetention) return;
		savingRetention = true;
		try {
			await saveSettings({ archiveRetentionMonths: retentionMonths });
			savedRetentionMonths = retentionMonths;
			toastStore.success('Settings saved');
		} catch {
			toastStore.error('Failed to save settings');
		} finally {
			savingRetention = false;
		}
	}

	async function handleLossWarningSave() {
		if (!hasLossWarningChanges || !isLossWarningValid || savingWarningWindow) return;
		savingWarningWindow = true;
		try {
			await saveSettings({ lossWarningWindowDays: warningWindowDays });
			savedWarningWindowDays = warningWindowDays;
			toastStore.success('Settings saved');
		} catch {
			toastStore.error('Failed to save settings');
		} finally {
			savingWarningWindow = false;
		}
	}

	async function handleCriticalTasksSave() {
		if (!hasCriticalTasksChanges || !isCriticalTasksValid || savingCriticalTasks) return;
		savingCriticalTasks = true;
		try {
			await saveSettings({
				criticalTasksDefaultExpirationMonths,
				criticalTasksExpiringSoonWarningDays
			});
			savedCriticalTasksDefaultExpirationMonths = criticalTasksDefaultExpirationMonths;
			savedCriticalTasksExpiringSoonWarningDays = criticalTasksExpiringSoonWarningDays;
			toastStore.success('Settings saved');
		} catch {
			toastStore.error('Failed to save settings');
		} finally {
			savingCriticalTasks = false;
		}
	}
</script>

<div class="settings-page">
	<main class="page-content">
		<Toolbar ariaLabel="Organization policy status" leadingMin="0" collapse="narrow">
			{#snippet leading()}
				<ToolbarMetaItem
					label={hasPendingChanges ? 'Unsaved changes' : 'Saved'}
					tone={hasPendingChanges ? 'warning' : 'default'}
				/>
			{/snippet}
		</Toolbar>

		<section class="settings-section">
			<div class="section-heading">
				<p class="section-label">Retention Policy</p>
				<h2>Archive Retention</h2>
			</div>
			<p class="section-description">
				Archived personnel records are automatically purged after the retention period expires. Set how long archived
				records should be kept before permanent deletion.
			</p>

			<div class="form-panel">
				<div class="form-group">
					<label class="label" for="retention-months">Retention period (months)</label>
					<div class="input-row">
						<input id="retention-months" class="input" type="number" min="1" max="120" bind:value={retentionMonths} />
						<button
							class="btn btn-primary"
							disabled={!hasRetentionChanges || !isRetentionValid || savingRetention}
							onclick={handleRetentionSave}
						>
							{#if savingRetention}<Spinner />{/if}
							{savingRetention ? 'Saving...' : 'Save Retention'}
						</button>
					</div>
					{#if !isRetentionValid}
						<p class="text-error validation-hint">Must be between 1 and 120 months.</p>
					{/if}
				</div>
			</div>
		</section>

		<section class="settings-section">
			<div class="section-heading">
				<p class="section-label">Operational Tracking</p>
				<h2>Loss Warning Window</h2>
			</div>
			<p class="section-description">
				Set the follow-up window used to flag personnel approaching ETS or PCS / DEROS timelines.
			</p>

			<div class="form-panel">
				<div class="form-group">
					<label class="label" for="loss-warning-window">Loss warning window (days)</label>
					<div class="input-row">
						<input
							id="loss-warning-window"
							class="input"
							type="number"
							min="1"
							max="365"
							bind:value={warningWindowDays}
						/>
						<button
							class="btn btn-primary"
							disabled={!hasLossWarningChanges || !isLossWarningValid || savingWarningWindow}
							onclick={handleLossWarningSave}
						>
							{#if savingWarningWindow}<Spinner />{/if}
							{savingWarningWindow ? 'Saving...' : 'Save Warning Window'}
						</button>
					</div>
					{#if !isLossWarningValid}
						<p class="text-error validation-hint">Must be between 1 and 365 days.</p>
					{/if}
				</div>
			</div>
		</section>

		<section class="settings-section">
			<div class="section-heading">
				<p class="section-label">Critical Tasks</p>
				<h2>Critical Tasks</h2>
			</div>
			<p class="section-description">
				Set the organization defaults used when ICT tasks do not define their own expiration override. These values feed
				the shared Critical Tasks status calculation for current, expiring-soon, and expired readiness.
			</p>

			<div class="form-panel">
				<div class="form-grid">
					<div class="form-group">
						<label class="label" for="critical-tasks-default-expiration">Default expiration (months)</label>
						<input
							id="critical-tasks-default-expiration"
							class="input"
							type="number"
							min="1"
							max="120"
							bind:value={criticalTasksDefaultExpirationMonths}
						/>
					</div>
					<div class="form-group">
						<label class="label" for="critical-tasks-warning-days">Expiring soon window (days)</label>
						<input
							id="critical-tasks-warning-days"
							class="input"
							type="number"
							min="1"
							max="365"
							bind:value={criticalTasksExpiringSoonWarningDays}
						/>
					</div>
				</div>
				<div class="section-actions">
					<button
						class="btn btn-primary"
						disabled={!hasCriticalTasksChanges || !isCriticalTasksValid || savingCriticalTasks}
						onclick={handleCriticalTasksSave}
					>
						{#if savingCriticalTasks}<Spinner />{/if}
						{savingCriticalTasks ? 'Saving...' : 'Save Critical Tasks'}
					</button>
				</div>
				{#if !isCriticalTasksValid}
					<p class="text-error validation-hint">
						Default expiration must be between 1 and 120 months. Warning window must be between 1 and 365 days.
					</p>
				{/if}
			</div>
		</section>
	</main>
</div>

<style>
	.settings-page {
		min-height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--surface-page);
	}

	.page-content {
		width: min(880px, 100%);
		margin: 0 auto;
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.section-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.section-label {
		margin: 0;
		color: var(--amber);
	}

	.settings-section {
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.section-heading {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.settings-section h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2rem, 4vw, 2.8rem);
		line-height: 0.98;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.section-description {
		color: var(--text-secondary);
		font-size: var(--text-sm);
		margin: 0;
		line-height: 1.6;
	}

	.form-panel {
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 68%, var(--surface-panel) 32%);
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--sp-3);
	}

	.input-row {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.input-row .input {
		width: 120px;
	}

	.section-actions {
		margin-top: var(--sp-4);
		display: flex;
		justify-content: flex-start;
	}

	.validation-hint {
		margin: var(--sp-2) 0 0;
		font-size: var(--text-xs);
	}

	@media (max-width: 640px) {
		.page-content {
			padding: var(--sp-4);
		}

		.input-row {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
