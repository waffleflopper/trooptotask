<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import { page } from '$app/stores';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';

	let { data } = $props();
	const orgId = $derived($page.params.orgId);
	const serverRetention = $derived(data.retentionMonths);
	const serverWarningWindow = $derived(data.lossWarningWindowDays);

	let retentionMonths = $state(0);
	let savedValue = $state(0);
	let warningWindowDays = $state(0);
	let savedWarningWindowDays = $state(0);
	let saving = $state(false);
	const hasChanges = $derived(retentionMonths !== savedValue || warningWindowDays !== savedWarningWindowDays);
	const retentionIsValid = $derived(retentionMonths >= 1 && retentionMonths <= 120);
	const warningWindowIsValid = $derived(warningWindowDays >= 1 && warningWindowDays <= 365);
	const isValid = $derived(retentionIsValid && warningWindowIsValid);

	$effect.pre(() => {
		retentionMonths = serverRetention;
		savedValue = serverRetention;
		warningWindowDays = serverWarningWindow;
		savedWarningWindowDays = serverWarningWindow;
	});

	async function handleSave() {
		if (!hasChanges || !isValid || saving) return;
		saving = true;
		try {
			const res = await fetch(`/org/${orgId}/api/organization/settings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					archiveRetentionMonths: retentionMonths,
					lossWarningWindowDays: warningWindowDays
				})
			});
			if (!res.ok) throw new Error();
			savedValue = retentionMonths;
			savedWarningWindowDays = warningWindowDays;
			toastStore.success('Settings saved');
		} catch {
			toastStore.error('Failed to save settings');
		} finally {
			saving = false;
		}
	}
</script>

<div class="settings-page">
	<PageToolbar title="Organization Settings" helpTopic="settings" />

	<main class="page-content">
		<div class="overview-strip">
			<div class="overview-card">
				<span class="overview-label">Retention</span>
				<strong class="overview-value">{savedValue} mo</strong>
				<span class="overview-meta">Current archive retention window before permanent cleanup</span>
			</div>
			<div class="overview-card">
				<span class="overview-label">Warning Window</span>
				<strong class="overview-value">{savedWarningWindowDays} d</strong>
				<span class="overview-meta">Current loss warning window before ETS or PCS / DEROS follow-up</span>
			</div>
			<div class="overview-card">
				<span class="overview-label">Change State</span>
				<strong class="overview-value">{hasChanges ? 'Pending' : 'Saved'}</strong>
				<span class="overview-meta"
					>{hasChanges
						? 'You have unsaved organization-settings changes'
						: 'The current settings match what is saved'}</span
				>
			</div>
		</div>

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
					</div>
					{#if !retentionIsValid}
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
					</div>
					{#if !warningWindowIsValid}
						<p class="text-error validation-hint">Must be between 1 and 365 days.</p>
					{/if}
				</div>
			</div>
		</section>

		<div class="actions-row">
			<button class="btn btn-primary" disabled={!hasChanges || !isValid || saving} onclick={handleSave}>
				{#if saving}<Spinner />{/if}
				{saving ? 'Saving...' : 'Save'}
			</button>
		</div>
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

	.overview-strip {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--sp-3);
	}

	.overview-card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-panel) 92%, var(--surface-subtle) 8%);
	}

	.overview-label,
	.section-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.overview-label {
		color: var(--text-muted);
	}

	.section-label {
		margin: 0;
		color: var(--amber);
	}

	.overview-value {
		font-family: var(--font-display);
		font-size: clamp(1.9rem, 4vw, 2.5rem);
		line-height: 0.95;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.overview-meta {
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--text-secondary);
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

	.actions-row {
		display: flex;
		justify-content: flex-end;
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
