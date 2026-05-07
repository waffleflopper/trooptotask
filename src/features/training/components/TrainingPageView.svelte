<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

	import { goto } from '$app/navigation';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import { filterColumnsByView } from '$features/training/utils/viewFiltering';
	import TrainingMatrix from '$features/training/components/TrainingMatrix.svelte';
	import ViewEditorModal from '$features/training/components/ViewEditorModal.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
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
		{ value: 'by-group', label: 'Group' }
	];
	const activeFilterCount = $derived((ctx.selectedViewId ? 1 : 0) + (ctx.selectedGroupId ? 1 : 0));
	const toolbarActions = $derived.by<WorkspaceToolbarAction[]>(() => {
		const actions: WorkspaceToolbarAction[] = [];

		if (ctx.canManageConfig) {
			actions.push(
				{
					id: 'bulk-import',
					label: 'Import',
					onclick: () => modals.open('bulk-import'),
					icon: 'upload',
					disabled: ctx.readOnly,
					disabledReason: ctx.readOnly ? 'Upgrade to edit' : undefined,
					priority: 'normal'
				},
				{
					id: 'manage-views',
					label: 'Manage Views',
					onclick: () => (showViewEditor = true),
					icon: 'settings',
					disabled: ctx.readOnly,
					disabledReason: ctx.readOnly ? 'Upgrade to edit' : undefined,
					priority: 'normal'
				}
			);
		}

		actions.push(
			{
				id: 'sign-in-rosters',
				label: 'Sign-In Rosters',
				onclick: () => modals.open('sign-in-rosters'),
				icon: 'clipboard-list',
				priority: 'normal'
			},
			{
				id: 'reports',
				label: 'Reports',
				href: `/org/${ctx.orgId}/training/reports`,
				icon: 'chart',
				priority: 'normal'
			}
		);

		if (ctx.canManageConfig) {
			actions.push({
				id: 'manage-types',
				label: 'Manage Types',
				href: `/org/${ctx.orgId}/training/types`,
				icon: 'book-open',
				priority: 'critical',
				variant: 'primary'
			});
		}

		return actions;
	});
</script>

<div class="page">
	{#if !ctx.canViewTraining}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<main class="page-content">
			<WorkspaceToolbar.Root ariaLabel="Training controls">
				<WorkspaceToolbar.Group label="Training filters" activeCount={activeFilterCount} data-testid="training-filters">
					<ButtonGroup.Root aria-label="Training matrix view mode">
						{#each matrixViewOptions as option (option.value)}
							<Button
								variant={ctx.viewMode === option.value ? 'secondary' : 'outline'}
								aria-pressed={ctx.viewMode === option.value}
								onclick={() => ctx.setViewMode(option.value as 'alphabetical' | 'by-group')}
							>
								{option.label}
							</Button>
						{/each}
					</ButtonGroup.Root>
					<WorkspaceToolbar.Select
						ariaLabel="Training view filter"
						options={trainingViewOptions}
						value={ctx.selectedViewId ?? ''}
						onValueChange={(value) => ctx.setSelectedViewId(value || null)}
					/>
					<WorkspaceToolbar.Select
						ariaLabel="Training group filter"
						options={groupFilterOptions}
						value={ctx.selectedGroupId}
						onValueChange={(value) => ctx.setSelectedGroupId(value)}
					/>
				</WorkspaceToolbar.Group>

				<WorkspaceToolbar.Group label="Training actions" zone="actions">
					<WorkspaceToolbar.Actions
						actions={toolbarActions}
						ariaLabel="Training actions"
						overflowAriaLabel="More training actions"
					/>
				</WorkspaceToolbar.Group>
				{#if ctx.readOnly}
					<WorkspaceToolbar.Group label="Training edit status" zone="meta">
						<WorkspaceToolbar.Meta tone="warning">Upgrade to edit</WorkspaceToolbar.Meta>
					</WorkspaceToolbar.Group>
				{/if}
			</WorkspaceToolbar.Root>

			{#if loading}
				<div class="skeleton-matrix-wrapper">
					<SkeletonGrid rows={8} columns={6} cellWidth="100px" cellHeight="38px" />
				</div>
			{:else if trainingTypesStore.items.length === 0}
				<EmptyState
					message="No training types defined yet."
					actionLabel={ctx.canManageConfig ? 'Manage Types' : undefined}
					onAction={ctx.canManageConfig ? () => goto(`/org/${ctx.orgId}/training/types`) : undefined}
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
							onCellClick={ctx.canRecordTraining ? ctx.handleCellClick.bind(ctx) : undefined}
							onPersonClick={ctx.canRecordTraining ? ctx.handlePersonClick.bind(ctx) : undefined}
						/>
					{:else}
						<TrainingMatrix
							personnel={ctx.filteredPersonnel}
							trainingTypes={filteredTypes}
							trainings={personnelTrainingsStore.items}
							onCellClick={ctx.canRecordTraining ? ctx.handleCellClick.bind(ctx) : undefined}
							onPersonClick={ctx.canRecordTraining ? ctx.handlePersonClick.bind(ctx) : undefined}
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
	}

	@media (min-width: 641px) and (max-width: 1024px) {
		.view-panel,
		.skeleton-matrix-wrapper {
			padding-left: 0;
			padding-right: 0;
		}
	}
</style>
