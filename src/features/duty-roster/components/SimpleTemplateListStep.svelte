<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	interface SimpleTemplate {
		id: string;
		name: string;
		shortName: string;
		exemptPersonnelCount: number;
		description: string;
		assignmentTypeId: string;
	}
	interface Props {
		simpleTemplates: SimpleTemplate[];
		onBack: () => void;
		onChooseTemplate: (assignmentTypeId: string) => void;
	}
	let { simpleTemplates, onBack, onChooseTemplate }: Props = $props();
</script>

<section class="step-card card card-flat">
	<div class="list-header">
		<div>
			<p class="eyebrow">Assignments / Taskings</p>
			<h3>Choose an assignment type</h3>
		</div>
		<button class="btn btn-secondary btn-sm" type="button" onclick={onBack}>Back</button>
	</div>
	{#if simpleTemplates.length === 0}
		<EmptyState
			message="No one-person assignment types available yet. Add a personnel assignment type first."
			variant="simple"
		/>
	{:else}
		<div class="template-list">
			{#each simpleTemplates as template (template.id)}
				<article class="template-row">
					<div class="template-main">
						<h4>{template.name}</h4>
						<p class="template-meta">{template.shortName} · {template.exemptPersonnelCount} exempt</p>
						{#if template.description}<p class="template-description">{template.description}</p>{/if}
					</div>
					<button
						class="btn btn-primary btn-sm"
						type="button"
						aria-label={`Use ${template.name}`}
						onclick={() => onChooseTemplate(template.assignmentTypeId)}>Use</button
					>
				</article>
			{/each}
		</div>
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
	.template-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
	}
	.template-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-page);
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
	.template-meta,
	.template-description {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
	}
	h3,
	h4 {
		margin: 0;
	}

	@media (max-width: 640px) {
		.template-row {
			grid-template-columns: 1fr;
			align-items: stretch;
		}
	}
</style>
