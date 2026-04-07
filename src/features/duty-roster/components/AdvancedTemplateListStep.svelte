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
			<p class="eyebrow">Step 1 of 4 · Choose template</p>
			<h3>Select an existing template or build one from scratch.</h3>
			<p class="wizard-copy">
				Use a ready template to jump into policy review, or open the template builder to create a new advanced duty.
			</p>
		</div>
		<button class="btn btn-secondary btn-sm" type="button" onclick={onBack}>Back</button>
	</div>
	<div class="template-grid">
		<article class="template-card preset-card-blank">
			<div>
				<h4>Build from scratch</h4>
				<p class="template-description">Open the template builder and configure every field yourself.</p>
			</div>
			<button class="btn btn-secondary btn-sm" type="button" onclick={onBuildFromScratch}>Build from scratch</button>
		</article>
		{#each activeAdvancedTemplates as template (template.id)}
			<article class="template-card">
				<div>
					<h4>{template.name}</h4>
					<p class="template-meta">
						{template.coverageMode === 'timed' ? `${template.startTime} to ${template.endTime}` : 'All day'} · {template
							.slots.length} slot{template.slots.length === 1 ? '' : 's'}
					</p>
					<p class="template-description">{template.description ?? 'No description.'}</p>
				</div>
				<button class="btn btn-primary btn-sm" type="button" onclick={() => onChooseTemplate(template.id)}
					>Use This Template</button
				>
			</article>
		{/each}
	</div>
	{#if activeAdvancedTemplates.length === 0}
		<EmptyState
			message="No active advanced duty templates ready. Save and activate one in the template builder, then return here."
			variant="simple"
		/>
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
	}
	.template-grid {
		display: grid;
		gap: var(--sp-4);
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		margin-top: var(--sp-4);
	}
	.template-card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}
	.preset-card-blank {
		border-style: dashed;
		background: var(--surface-subtle);
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
	.template-meta,
	.template-description,
	.wizard-copy {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
	}
	h3,
	h4 {
		margin: 0;
	}
</style>
