<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { DutyTemplate } from '../duty-roster.types';
	interface Props {
		activeAdvancedTemplates: DutyTemplate[];
		onBack: () => void;
		onChooseTemplate: (templateId: string) => void;
		onBuildFromScratch: () => void;
	}
	let { activeAdvancedTemplates, onBack, onChooseTemplate, onBuildFromScratch }: Props = $props();
</script>

<section class="step-card card card-flat">
	<div class="list-header">
		<div>
			<p class="eyebrow">Advanced</p>
			<h3>Use a template</h3>
		</div>
		<div class="header-actions">
			<button class="btn btn-secondary btn-sm" type="button" onclick={onBuildFromScratch}>New</button>
			<button class="btn btn-secondary btn-sm" type="button" onclick={onBack}>Back</button>
		</div>
	</div>
	<div class="template-list">
		{#each activeAdvancedTemplates as template (template.id)}
			<article class="template-row">
				<div class="template-main">
					<h4>{template.name}</h4>
					<p class="template-meta">
						{template.coverageMode === 'timed' ? `${template.startTime} to ${template.endTime}` : 'All day'} · {template
							.slots.length} slot definition{template.slots.length === 1 ? '' : 's'}
					</p>
				</div>
				<button
					class="btn btn-primary btn-sm"
					type="button"
					aria-label={`Use ${template.name}`}
					onclick={() => onChooseTemplate(template.id)}>Use</button
				>
			</article>
		{/each}
	</div>
	{#if activeAdvancedTemplates.length === 0}
		<EmptyState message="No active advanced templates yet." variant="simple" />
	{/if}
</section>

<style>
	.step-card {
		padding: var(--sp-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}
	.list-header {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-4);
		align-items: flex-start;
	}
	.header-actions {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.template-list {
		display: grid;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
	}
	.template-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3) 0;
		border-top: 1px solid var(--border-subtle);
	}
	.template-main {
		min-width: 0;
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
	.template-meta {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
	}
	h3,
	h4 {
		margin: 0;
	}
	@media (max-width: 640px) {
		.list-header,
		.template-row {
			grid-template-columns: 1fr;
		}
		.list-header {
			display: grid;
		}
		.header-actions,
		.template-row :global(.btn) {
			width: 100%;
		}
	}
</style>
