<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { DutyTemplate } from '../duty-roster.types';

	interface Props {
		visibleTemplates: DutyTemplate[];
		selectedTemplateId: string | null;
		isCreatingNew: boolean;
		showArchivedTemplates: boolean;
		onToggleShowArchived: (value: boolean) => void;
		onCreateNew: () => void;
		onLoadTemplate: (template: DutyTemplate) => void;
	}

	let {
		visibleTemplates,
		selectedTemplateId,
		isCreatingNew,
		showArchivedTemplates,
		onToggleShowArchived,
		onCreateNew,
		onLoadTemplate
	}: Props = $props();
</script>

<aside class="template-rail" aria-label="Saved duty templates">
	<div class="rail-header">
		<p class="eyebrow">Templates</p>
		<label class="field field-checkbox"
			><input
				type="checkbox"
				checked={showArchivedTemplates}
				onchange={(e) => onToggleShowArchived((e.currentTarget as HTMLInputElement).checked)}
			/><span>Show archived</span></label
		>
	</div>
	<button type="button" class="new-template-button" class:active={isCreatingNew} onclick={onCreateNew}> New </button>
	{#if visibleTemplates.length === 0}
		<EmptyState message="No advanced duty templates yet." variant="simple" />
	{:else}
		{#each visibleTemplates as template (template.id)}
			<button
				type="button"
				class="template-chip"
				class:active={selectedTemplateId === template.id && !isCreatingNew}
				onclick={() => onLoadTemplate(template)}
			>
				<span>{template.name}</span>
				<Badge label={template.status} variant="outlined" />
			</button>
		{/each}
	{/if}
</aside>

<style>
	.template-rail {
		display: grid;
		gap: var(--sp-3);
		align-content: start;
		padding: var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}
	.rail-header {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-2);
		align-items: center;
	}
	.template-chip {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-2);
		align-items: center;
		padding: var(--sp-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}
	.template-chip.active {
		border-color: var(--amber);
		background: color-mix(in srgb, var(--amber-light) 22%, var(--surface-panel));
	}
	.new-template-button {
		padding: var(--sp-3);
		border: 1px dashed var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		color: var(--text-primary);
		font-weight: var(--font-weight-semibold);
		text-align: left;
	}
	.new-template-button.active {
		border-color: var(--amber);
		background: color-mix(in srgb, var(--amber-light) 22%, var(--surface-panel));
	}
	.eyebrow {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
	.field-checkbox {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
</style>
