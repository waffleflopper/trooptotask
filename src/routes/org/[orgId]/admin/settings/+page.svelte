<script lang="ts">
	import { page } from '$app/stores';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';

	let { data } = $props();
	const orgId = $derived($page.params.orgId);
	const serverRetention = $derived(data.retentionMonths);

	let retentionMonths = $state(0);
	let savedValue = $state(0);
	let saving = $state(false);
	const hasChanges = $derived(retentionMonths !== savedValue);
	const isValid = $derived(retentionMonths >= 1 && retentionMonths <= 120);

	$effect.pre(() => {
		retentionMonths = serverRetention;
		savedValue = serverRetention;
	});

	async function handleSave() {
		if (!hasChanges || !isValid || saving) return;
		saving = true;
		try {
			const res = await fetch(`/org/${orgId}/api/organization/settings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ archiveRetentionMonths: retentionMonths })
			});
			if (!res.ok) throw new Error();
			savedValue = retentionMonths;
			toastStore.success('Settings saved');
		} catch {
			toastStore.error('Failed to save settings');
		} finally {
			saving = false;
		}
	}
</script>

<div class="settings-page">
	<h2>Organization Settings</h2>

	<section class="settings-section">
		<h3>Archive Retention</h3>
		<p class="section-description">
			Archived personnel records are automatically purged after the retention period expires. Set how long archived
			records should be kept before permanent deletion.
		</p>

		<div class="form-group">
			<label class="label" for="retention-months">Retention period (months)</label>
			<div class="input-row">
				<input id="retention-months" class="input" type="number" min="1" max="120" bind:value={retentionMonths} />
				<button class="btn btn-primary" disabled={!hasChanges || !isValid || saving} onclick={handleSave}>
					{#if saving}<Spinner />{/if}
					{saving ? 'Saving...' : 'Save'}
				</button>
			</div>
			{#if !isValid}
				<p class="text-error validation-hint">Must be between 1 and 120 months.</p>
			{/if}
		</div>
	</section>
</div>

<style>
	.settings-page {
		max-width: 600px;
	}

	.settings-page h2 {
		margin: 0 0 var(--spacing-lg);
		font-size: var(--font-size-lg);
	}

	.settings-section {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-lg);
	}

	.settings-section h3 {
		margin: 0 0 var(--spacing-sm);
		font-size: var(--font-size-base);
	}

	.section-description {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		margin: 0 0 var(--spacing-md);
		line-height: 1.5;
	}

	.input-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.input-row .input {
		width: 120px;
	}

	.validation-hint {
		margin: var(--spacing-xs) 0 0;
		font-size: var(--font-size-xs);
	}
</style>
