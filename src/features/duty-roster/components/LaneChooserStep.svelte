<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';

	interface Props {
		canManageAdvancedTemplates: boolean;
		onChooseSimple: () => void;
		onChooseAdvanced: () => void;
	}
	let { canManageAdvancedTemplates, onChooseSimple, onChooseAdvanced }: Props = $props();
</script>

<div class="lane-grid">
	<article class="lane-card card card-flat">
		<p class="eyebrow">Assignments / Taskings</p>
		<h3>One-person assignment types.</h3>
		<p class="lane-copy">Use current assignment types without DA6 policy setup.</p>
		<button class="btn btn-primary" type="button" onclick={onChooseSimple}>Use Automatic Assignment Generator</button>
	</article>

	<article class="lane-card card card-flat">
		<div class="eyebrow-row">
			<p class="eyebrow">Advanced</p>
			<Badge label="Beta" />
		</div>
		<h3>Team-based duty templates.</h3>
		<p class="lane-copy">Preview and apply recurring duty series.</p>
		<button class="btn btn-secondary" type="button" disabled={!canManageAdvancedTemplates} onclick={onChooseAdvanced}
			>Use Advanced Duty</button
		>
		{#if !canManageAdvancedTemplates}
			<p class="lane-note">Advanced duty is limited to full-organization admins and full editors.</p>
		{/if}
	</article>
</div>

<style>
	.lane-grid {
		display: grid;
		gap: var(--sp-4);
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	}
	.lane-card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}
	.lane-copy,
	.lane-note {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
	}
	.eyebrow-row {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.eyebrow {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
	h3 {
		margin: 0;
	}
</style>
