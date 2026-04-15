<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { CriticalTasksPersonnelHistoryData } from '$features/critical-tasks/criticalTasks.types';

	interface Props {
		data: {
			orgId: string;
			criticalTasksPersonnelHistory: CriticalTasksPersonnelHistoryData;
		};
	}

	let { data }: Props = $props();

	const history = $derived(data.criticalTasksPersonnelHistory);
	const personnelName = $derived(
		[history.personnel.rank, `${history.personnel.lastName}, ${history.personnel.firstName}`].filter(Boolean).join(' ')
	);
</script>

<svelte:head>
	<title>{personnelName} ICT History - Troop to Task</title>
</svelte:head>

<PageToolbar
	title="ICT Completion History"
	subtitle={personnelName}
	breadcrumbs={[
		{ label: 'Critical Tasks', href: `/org/${data.orgId}/critical-tasks` },
		{ label: history.personnel.lastName }
	]}
>
	<a href={`/org/${data.orgId}/critical-tasks`} class="btn btn-sm">Back</a>
</PageToolbar>

<section class="history-page" aria-labelledby="ict-history-title">
	<div class="history-heading">
		<h2 id="ict-history-title">Historical Completions</h2>
		<p>Archived task records remain available here for audit context.</p>
	</div>

	{#if history.rows.length === 0}
		<EmptyState message="No ICT completion history recorded for this person." />
	{:else}
		<div class="history-table" role="table" aria-label="ICT completion history">
			<div class="history-row history-row-header" role="row">
				<span role="columnheader">Task</span>
				<span role="columnheader">Completed</span>
				<span role="columnheader">Method</span>
				<span role="columnheader">Validator</span>
				<span role="columnheader">Notes</span>
			</div>

			{#each history.rows as row (row.completion.id)}
				<div class="history-row" role="row">
					<div class="task-cell" role="cell">
						<span class="task-code">{row.taskCode}</span>
						<span class="task-title">{row.taskTitle}</span>
						{#if row.taskArchivedAt}
							<span class="archive-badge">Archived</span>
						{/if}
					</div>
					<span role="cell">{row.completion.completedAt}</span>
					<span role="cell">{row.completion.validationMethod}</span>
					<span role="cell">{row.completion.validatedBy ?? 'Not recorded'}</span>
					<span role="cell">{row.completion.notes ?? 'None'}</span>
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.history-page {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-5);
	}

	.history-heading {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.history-heading h2,
	.history-heading p {
		margin: 0;
	}

	.history-heading h2 {
		color: var(--text-primary);
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: var(--font-weight-display);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.history-heading p {
		color: var(--text-secondary);
	}

	.history-table {
		overflow-x: auto;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
	}

	.history-row {
		display: grid;
		grid-template-columns: minmax(16rem, 1.5fr) minmax(8rem, 0.7fr) minmax(10rem, 1fr) minmax(10rem, 1fr) minmax(
				12rem,
				1fr
			);
		min-width: 64rem;
		border-bottom: var(--border-thin);
	}

	.history-row:last-child {
		border-bottom: 0;
	}

	.history-row > span,
	.task-cell {
		padding: var(--sp-3);
		color: var(--text-primary);
		font-size: var(--text-sm);
	}

	.history-row-header {
		background: var(--surface-subtle);
	}

	.history-row-header span {
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.task-cell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.task-code {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
	}

	.task-title {
		font-weight: var(--font-weight-semibold);
	}

	.archive-badge {
		width: fit-content;
		padding: 0.125rem 0.375rem;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-subtle);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	@media (max-width: 820px) {
		.history-page {
			padding: var(--sp-4);
		}
	}
</style>
