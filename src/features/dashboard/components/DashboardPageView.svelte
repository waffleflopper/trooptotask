<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
	import UnitReadinessTab from './tabs/UnitReadinessTab.svelte';
	import PeopleDutyTab from './tabs/PeopleDutyTab.svelte';
	import TrainingEvalsTab from './tabs/TrainingEvalsTab.svelte';
	import { dashboardTabStore } from '../stores/dashboardTabStore.svelte';
	import { resolveDashboardTab } from '../dashboard.types';
	import type { DashboardContext } from '../contexts/DashboardContext.svelte';
	import { DASHBOARD_TABS, getDashboardToolbarActions } from '../utils/dashboardToolbarActions';

	let { ctx }: { ctx: DashboardContext } = $props();

	onMount(() => {
		dashboardTabStore.init(ctx.data.orgId);
	});

	const dashboardToolbarActions = $derived<WorkspaceToolbarAction[]>(
		getDashboardToolbarActions(ctx.data.orgId, ctx.data.permissions, dashboardTabStore.activeTab)
	);

	const activeTabLabel = $derived(
		DASHBOARD_TABS.find((tab) => tab.id === dashboardTabStore.activeTab)?.label ?? 'dashboard view'
	);

	function handleTabChange(value: string): void {
		dashboardTabStore.setTab(resolveDashboardTab(value));
	}
</script>

<svelte:head>
	<title>{ctx.data.orgName} — Dashboard — Troop to Task</title>
</svelte:head>

<div class="flex h-full flex-col">
	<Tabs.Root
		value={dashboardTabStore.activeTab}
		onValueChange={handleTabChange}
		class="min-h-0 flex-1 gap-0"
		activationMode="manual"
	>
		<div class="px-3 pt-3 sm:px-6 sm:pt-4">
			<WorkspaceToolbar.Root ariaLabel="Dashboard controls">
				<WorkspaceToolbar.Group label="Dashboard sections">
					<Tabs.List aria-label="Dashboard views">
						{#each DASHBOARD_TABS as tab (tab.id)}
							<Tabs.Trigger value={tab.id}>{tab.label}</Tabs.Trigger>
						{/each}
					</Tabs.List>

					{#if !dashboardTabStore.isDefault}
						<Button
							variant="outline"
							size="sm"
							aria-label="Set {activeTabLabel} as default dashboard view"
							disabled={dashboardTabStore.saving}
							onclick={() => dashboardTabStore.setDefaultTab(ctx.data.orgId)}
						>
							{dashboardTabStore.saving ? 'Saving...' : 'Set as default'}
						</Button>
					{/if}
				</WorkspaceToolbar.Group>

				{#if dashboardToolbarActions.length > 0}
					<WorkspaceToolbar.Group label="Dashboard quick actions" zone="actions">
						<WorkspaceToolbar.Actions
							actions={dashboardToolbarActions}
							ariaLabel="Dashboard quick actions"
							overflowAriaLabel="More dashboard actions"
						/>
					</WorkspaceToolbar.Group>
				{/if}
			</WorkspaceToolbar.Root>

			{#if dashboardTabStore.error}
				<WorkspaceToolbar.Meta tone="warning" role="status">{dashboardTabStore.error}</WorkspaceToolbar.Meta>
			{/if}
		</div>

		<main class="page-scroll flex-1 overflow-y-auto" id="main-content">
			{#if ctx.isHydrating || dashboardTabStore.loading}
				<div class="flex flex-col gap-3 p-4" aria-busy="true" aria-live="polite" role="status">
					<div class="grid gap-3 lg:grid-cols-3">
						<Skeleton data-testid="skeleton-block" class="h-40" />
						<Skeleton data-testid="skeleton-block" class="h-40" />
						<Skeleton data-testid="skeleton-block" class="h-40" />
					</div>
					<div class="grid gap-3 md:grid-cols-2">
						<Skeleton data-testid="skeleton-block" class="h-55" />
						<Skeleton data-testid="skeleton-block" class="h-55" />
					</div>
				</div>
			{:else}
				<Tabs.Content value="unit-readiness">
					{#if dashboardTabStore.activeTab === 'unit-readiness'}
						<UnitReadinessTab {ctx} />
					{/if}
				</Tabs.Content>
				<Tabs.Content value="people-duty">
					{#if dashboardTabStore.activeTab === 'people-duty'}
						<PeopleDutyTab {ctx} />
					{/if}
				</Tabs.Content>
				<Tabs.Content value="training-evals">
					{#if dashboardTabStore.activeTab === 'training-evals'}
						<TrainingEvalsTab {ctx} />
					{/if}
				</Tabs.Content>
			{/if}
		</main>
	</Tabs.Root>
</div>
