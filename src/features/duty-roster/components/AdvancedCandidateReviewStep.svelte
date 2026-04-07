<script lang="ts">
	import DataTable from '$lib/components/ui/data-table/DataTable.svelte';
	import type { ColumnDef } from '$lib/components/ui/data-table/useDataTable.svelte';
	import type { Personnel } from '$lib/types';
	interface Props {
		templateName: string;
		candidates: Personnel[];
		columns: ColumnDef<Personnel>[];
		selectedCount: number;
		totalCount: number;
		isPreviewing: boolean;
		canPreviewSingle: boolean;
		canPreviewSeries: boolean;
		isSelected: (personId: string) => boolean;
		formatLabel: (person: Personnel) => string;
		onToggleCandidate: (personId: string) => void;
		onBack: () => void;
		onPreviewSingle: () => void;
		onPreviewSeries: () => void;
	}
	let props: Props = $props();
</script>

<section class="step-card card card-flat">
	<div class="list-header">
		<div>
			<p class="eyebrow">Step 3 of 4 · Candidate review</p>
			<h3>Choose who can be considered for this run.</h3>
			<p class="wizard-copy">
				Review the people who can be considered for this run, then deselect anyone you do not want in the generator
				pool.
			</p>
			<p class="template-meta">{props.selectedCount} of {props.totalCount} candidates included</p>
		</div>
		<button class="btn btn-secondary btn-sm" type="button" onclick={props.onBack}>Back</button>
	</div>
	<div class="step-actions">
		<button
			class="btn btn-secondary"
			type="button"
			disabled={!props.canPreviewSingle || props.isPreviewing}
			onclick={props.onPreviewSingle}>{props.isPreviewing ? 'Generating Preview...' : 'Preview One-Time Event'}</button
		><button
			class="btn btn-primary"
			type="button"
			disabled={!props.canPreviewSeries || props.isPreviewing}
			onclick={props.onPreviewSeries}>{props.isPreviewing ? 'Generating Preview...' : 'Preview Series'}</button
		>
	</div>
	<div class="candidate-review-table-wrap">
		<DataTable
			data={props.candidates}
			columns={props.columns}
			compact
			showSearch
			stickyHeader
			ariaLabel="Candidate review table"
			searchPlaceholder="Search candidates by name, group, MOS, or role..."
			emptyMessage="No candidates are available for this template."
			>{#snippet cell(person, col)}{#if col.key === 'include'}<input
						type="checkbox"
						checked={props.isSelected(person.id)}
						aria-label={`Include ${props.formatLabel(person)} in this run`}
						onchange={() => props.onToggleCandidate(person.id)}
						onclick={(event) => event.stopPropagation()}
					/>{:else}{String(col.value(person) ?? '')}{/if}{/snippet}</DataTable
		>
	</div>
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
	.candidate-review-table-wrap,
	.step-actions {
		margin-top: var(--sp-4);
	}
	.step-actions {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
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
	.wizard-copy,
	.template-meta {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
	}
	h3 {
		margin: 0;
	}
</style>
