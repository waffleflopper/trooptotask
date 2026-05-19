<script lang="ts">
	import { goto } from '$app/navigation';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import { filterColumnsByView } from '$features/training/utils/viewFiltering';
	import TrainingMatrix from '$features/training/components/TrainingMatrix.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import type { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { rosterStore } from '$lib/stores/roster.svelte';

	let { ctx, modals }: { ctx: TrainingPageContext; modals: ModalRegistry } = $props();

	const storesHydratedForOrg = $derived(
		rosterStore.orgId === ctx.orgId &&
			groupsStore.orgId === ctx.orgId &&
			trainingTypesStore.orgId === ctx.orgId &&
			trainingViewsStore.orgId === ctx.orgId &&
			personnelTrainingsStore.orgId === ctx.orgId
	);

	const loading = $derived(
		!storesHydratedForOrg ||
			rosterStore.loading ||
			groupsStore.loading ||
			trainingTypesStore.loading ||
			trainingViewsStore.loading ||
			personnelTrainingsStore.loading
	);

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
					href: `/org/${ctx.orgId}/training/views`,
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

<div class="flex h-full flex-col bg-background">
	{#if !ctx.canViewTraining}
		<Empty.Root class="m-6 min-h-80 rounded-lg border border-border bg-card p-8 text-center">
			<Empty.Header>
				<Empty.Title>Access Restricted</Empty.Title>
				<Empty.Description>
					You don't have permission to view this area. Contact your organization admin for access.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<main class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
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
				<div
					class="grid gap-2 overflow-hidden rounded-lg border border-border bg-card p-3"
					aria-hidden="true"
					data-testid="skeleton-grid"
				>
					<div class="flex gap-2">
						{#each Array.from({ length: 6 }) as _, index (index)}
							<Skeleton class="h-8 w-28" />
						{/each}
					</div>
					{#each Array.from({ length: 8 }) as _, rowIndex (rowIndex)}
						<div class="flex gap-2">
							{#each Array.from({ length: 6 }) as _, colIndex (`${rowIndex}-${colIndex}`)}
								<Skeleton class="h-9 w-28" />
							{/each}
						</div>
					{/each}
				</div>
			{:else if trainingTypesStore.items.length === 0}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No training types defined yet.</Empty.Title>
					</Empty.Header>
					{#if ctx.canManageConfig}
						<Empty.Content>
							<Button onclick={() => goto(`/org/${ctx.orgId}/training/types`)}>Manage Types</Button>
						</Empty.Content>
					{/if}
				</Empty.Root>
			{:else if ctx.filteredPersonnel.length === 0}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No personnel found.</Empty.Title>
					</Empty.Header>
				</Empty.Root>
			{:else}
				<div class="min-h-0 flex-1 overflow-auto" data-testid="training-matrix">
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
