<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
	import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';

	let { data } = $props();

	const org = getOrgContext();
	const orgId = $derived(data.orgId ?? org.orgId);
	const permissions = $derived(data.permissions ?? org.permissions);
	const overflowItems = $derived(
		org.isPrivileged
			? [
					{
						label: 'Task Library',
						href: `/org/${orgId}/critical-tasks/library`
					}
				]
			: []
	);

	const storesHydratedForOrg = $derived(
		personnelStore.orgId === orgId &&
			groupsStore.orgId === orgId &&
			ictTasksStore.orgId === orgId &&
			personnelIctCompletionsStore.orgId === orgId
	);

	const loading = $derived(
		!storesHydratedForOrg ||
			personnelStore.loading ||
			groupsStore.loading ||
			ictTasksStore.loading ||
			personnelIctCompletionsStore.loading
	);
</script>

<svelte:head>
	<title>Critical Tasks - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar title="Critical Tasks" subtitle="ICTL readiness" {overflowItems} />

	{#if !permissions.canViewTraining}
		<section class="page-message" aria-labelledby="critical-tasks-restricted-title">
			<h2 id="critical-tasks-restricted-title">Access Restricted</h2>
			<p>Contact your organization admin for training access.</p>
		</section>
	{:else if loading}
		<section class="workspace-state" data-testid="critical-tasks-loading" aria-label="Loading Critical Tasks">
			<SkeletonGrid rows={6} columns={4} />
		</section>
	{:else if ictTasksStore.items.length === 0}
		<section class="workspace-state">
			<EmptyState message="No critical tasks yet. Add ICTL tasks to begin tracking annual proficiency." />
		</section>
	{:else}
		<section class="workspace-state" aria-labelledby="critical-tasks-ready-title">
			<div class="summary-strip">
				<div>
					<span class="summary-value">{personnelStore.items.length}</span>
					<span class="summary-label">Personnel</span>
				</div>
				<div>
					<span class="summary-value">{ictTasksStore.items.length}</span>
					<span class="summary-label">Tasks</span>
				</div>
				<div>
					<span class="summary-value">{personnelIctCompletionsStore.items.length}</span>
					<span class="summary-label">Validations</span>
				</div>
			</div>
			<h2 id="critical-tasks-ready-title">Workspace Ready</h2>
			<p>Task matrix and readiness reports will build from this workspace data.</p>
		</section>
	{/if}
</div>

<style>
	.page {
		min-height: 100%;
	}

	.workspace-state,
	.page-message {
		padding: var(--sp-6);
	}

	.page-message {
		max-width: 52rem;
	}

	.page-message h2,
	.workspace-state h2 {
		margin: 0 0 var(--sp-2);
		color: var(--text-primary);
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.page-message p,
	.workspace-state p {
		margin: 0;
		color: var(--text-secondary);
	}

	.summary-strip {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: var(--sp-3);
		margin-bottom: var(--sp-6);
	}

	.summary-strip > div {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		padding: var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
	}

	.summary-value {
		color: var(--text-primary);
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		font-weight: var(--font-weight-display);
		line-height: 1;
	}

	.summary-label {
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}
</style>
