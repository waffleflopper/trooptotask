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
			<p class="eyebrow">Assignment templates</p>
			<h3>Select an existing assignment type.</h3>
		</div>
		<button class="btn btn-secondary btn-sm" type="button" onclick={onBack}>Back</button>
	</div>
	{#if simpleTemplates.length === 0}
		<EmptyState
			message="No one-person assignment types available yet. Add a personnel assignment type first."
			variant="simple"
		/>
	{:else}
		<div class="template-grid">
			{#each simpleTemplates as template (template.id)}
				<article class="template-card">
					<div>
						<h4>{template.name}</h4>
						<p class="template-meta">{template.shortName} · {template.exemptPersonnelCount} exempt</p>
						<p class="template-description">{template.description}</p>
					</div>
					<button
						class="btn btn-primary btn-sm"
						type="button"
						onclick={() => onChooseTemplate(template.assignmentTypeId)}>Continue with {template.name}</button
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
</style>
