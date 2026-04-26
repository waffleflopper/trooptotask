<script lang="ts">
	import { goto } from '$app/navigation';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import { filterColumnsByView } from '$features/training/utils/viewFiltering';
	import TrainingMatrix from '$features/training/components/TrainingMatrix.svelte';
	import ViewEditorModal from '$features/training/components/ViewEditorModal.svelte';
	import FloatingPageToolbar from '$lib/components/FloatingPageToolbar.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import ToolbarSelect from '$lib/components/ui/ToolbarSelect.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import type { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';

	let { ctx, modals }: { ctx: TrainingPageContext; modals: ModalRegistry } = $props();

	const storesHydratedForOrg = $derived(
		personnelStore.orgId === ctx.orgId &&
			groupsStore.orgId === ctx.orgId &&
			trainingTypesStore.orgId === ctx.orgId &&
			trainingViewsStore.orgId === ctx.orgId &&
			personnelTrainingsStore.orgId === ctx.orgId
	);

	const loading = $derived(
		!storesHydratedForOrg ||
			personnelStore.loading ||
			groupsStore.loading ||
			trainingTypesStore.loading ||
			trainingViewsStore.loading ||
			personnelTrainingsStore.loading
	);
	let showViewEditor = $state(false);

	const activeView = $derived(ctx.selectedViewId ? (trainingViewsStore.getById(ctx.selectedViewId) ?? null) : null);

	const filteredTypes = $derived(filterColumnsByView(trainingTypesStore.items, activeView));

	const trainingViewOptions = $derived([
		{ value: '', label: 'All Trainings' },
		...trainingViewsStore.items.map((view) => ({ value: view.id, label: view.name }))
	]);
	const groupFilterOptions = $derived([
		{ value: '', label: 'Group: All' },
		...ctx.groups.map((group) => ({ value: group.id, label: group.name }))
	]);
	const matrixViewOptions = [
		{ value: 'alphabetical', label: 'A-Z' },
		{ value: 'by-group', label: 'By Group' }
	];
</script>

<div class="page">
	{#if !ctx.canViewTraining}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<main class="page-content">
			<FloatingPageToolbar ariaLabel="Training controls" collapse="medium" leadingMin="34rem">
				{#snippet leading()}
					<div class="training-controls" aria-label="Training filters">
						<ToolbarSelect
							ariaLabel="Training view filter"
							options={trainingViewOptions}
							value={ctx.selectedViewId ?? ''}
							width="wide"
							onValueChange={(value) => ctx.setSelectedViewId(value || null)}
						/>
						<ToolbarSelect
							ariaLabel="Training group filter"
							options={groupFilterOptions}
							value={ctx.selectedGroupId}
							onValueChange={(value) => ctx.setSelectedGroupId(value)}
						/>
						<SegmentedControl
							ariaLabel="Training matrix view mode"
							options={matrixViewOptions}
							value={ctx.viewMode}
							onValueChange={(value) => ctx.setViewMode(value as 'alphabetical' | 'by-group')}
						/>
					</div>
				{/snippet}

				<button class="btn btn-sm" type="button" onclick={() => modals.open('sign-in-rosters')}>Sign-In Rosters</button>
				<a href={`/org/${ctx.orgId}/training/reports`} class="btn btn-sm">Reports</a>
				{#if ctx.canManageConfig}
					<button class="btn btn-sm" type="button" onclick={() => (showViewEditor = true)} disabled={ctx.readOnly}>
						Manage Views
					</button>
					<button class="btn btn-sm" type="button" onclick={() => modals.open('bulk-import')} disabled={ctx.readOnly}>
						Bulk Import
					</button>
					<a href={`/org/${ctx.orgId}/training/types`} class="btn btn-sm">Manage Types</a>
				{/if}
				{#if ctx.readOnly}
					<span class="text-muted" style="font-size: var(--text-xs);">Upgrade to edit</span>
				{/if}
			</FloatingPageToolbar>

			{#if loading}
				<div class="skeleton-matrix-wrapper">
					<SkeletonGrid rows={8} columns={6} cellWidth="100px" cellHeight="38px" />
				</div>
			{:else if trainingTypesStore.items.length === 0}
				<EmptyState
					message="No training types defined yet."
					actionLabel={ctx.canEditTraining ? 'Manage Types' : undefined}
					onAction={ctx.canEditTraining ? () => goto(`/org/${ctx.orgId}/training/types`) : undefined}
				/>
			{:else if ctx.filteredPersonnel.length === 0}
				<EmptyState message="No personnel found." />
			{:else}
				<div class="view-panel" data-testid="training-matrix">
					{#if ctx.viewMode === 'alphabetical'}
						<TrainingMatrix
							personnel={ctx.filteredPersonnel}
							trainingTypes={filteredTypes}
							trainings={personnelTrainingsStore.items}
							onCellClick={ctx.canEditTraining ? ctx.handleCellClick.bind(ctx) : undefined}
							onPersonClick={ctx.canEditTraining ? ctx.handlePersonClick.bind(ctx) : undefined}
						/>
					{:else}
						<TrainingMatrix
							personnel={ctx.filteredPersonnel}
							trainingTypes={filteredTypes}
							trainings={personnelTrainingsStore.items}
							onCellClick={ctx.canEditTraining ? ctx.handleCellClick.bind(ctx) : undefined}
							onPersonClick={ctx.canEditTraining ? ctx.handlePersonClick.bind(ctx) : undefined}
							groupBy={{
								key: (p) => p.groupName || 'Unassigned',
								compare: (a, b) => {
									const aPin = pinnedGroupsStore.list.includes(a) ? 0 : 1;
									const bPin = pinnedGroupsStore.list.includes(b) ? 0 : 1;
									if (aPin !== bPin) return aPin - bPin;
									return a.localeCompare(b);
								}
							}}
						/>
					{/if}
				</div>
			{/if}
		</main>
	{/if}
</div>

{#if showViewEditor}
	<ViewEditorModal onClose={() => (showViewEditor = false)} readOnly={ctx.readOnly} />
{/if}

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--surface-page);
	}

	.training-controls {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
		min-width: 0;
	}

	.no-permission {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 320px;
		margin: var(--sp-6);
		padding: var(--sp-8);
		text-align: center;
		color: var(--text-secondary);
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
	}

	.no-permission h2 {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 1.2rem + 0.8vw, 2.1rem);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.no-permission p {
		margin: 0;
		max-width: 44ch;
		line-height: var(--line-height-copy);
	}

	.page-content {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		padding: var(--sp-2);
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.view-panel {
		height: 100%;
		overflow: auto;
		padding: 0;
	}

	.skeleton-matrix-wrapper {
		padding: var(--sp-2) var(--sp-3);
		overflow: hidden;
	}

	@media (max-width: 640px) {
		.view-panel,
		.skeleton-matrix-wrapper {
			padding-left: 0;
			padding-right: 0;
		}

		.page-content {
			padding: var(--sp-2);
		}

		.training-controls {
			width: 100%;
		}

		.training-controls :global(select),
		.training-controls :global(.segmented-control) {
			flex: 1 1 100%;
			width: 100%;
		}
	}

	@media (min-width: 641px) and (max-width: 1024px) {
		.view-panel,
		.skeleton-matrix-wrapper {
			padding-left: 0;
			padding-right: 0;
		}
	}
</style>
