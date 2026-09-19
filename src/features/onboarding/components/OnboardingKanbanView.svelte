<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import { MODAL_IDS } from '../contexts/OnboardingPageContext.svelte';
	import type { PersonnelOnboarding } from '../onboarding.types';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Alert from '$lib/components/ui/alert';
	import * as Empty from '$lib/components/ui/empty';
	import * as KanbanBoard from '$lib/components/ui/kanban-board';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import OnboardingKanbanCard from './OnboardingKanbanCard.svelte';
	import OnboardingDetailSheet from './OnboardingDetailSheet.svelte';

	interface Props {
		ctx: OnboardingPageContext;
	}

	let { ctx }: Props = $props();

	interface Lane {
		id: string;
		label: string;
		min: number;
		max: number;
	}

	const lanes: Lane[] = [
		{ id: 'starting', label: 'Just Started', min: 0, max: 25 },
		{ id: 'progress', label: 'In Progress', min: 25, max: 75 },
		{ id: 'almost', label: 'Almost Done', min: 75, max: 100 },
		{ id: 'done', label: 'Complete', min: 100, max: 101 }
	];

	function getLane(onboarding: PersonnelOnboarding): string {
		const progress = ctx.getProgress(onboarding);
		const pct = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
		if (pct >= 100) return 'done';
		if (pct >= 75) return 'almost';
		if (pct >= 25) return 'progress';
		return 'starting';
	}

	function getOnboardingsForLane(laneId: string) {
		return ctx.filteredOnboardings.filter((o) => getLane(o) === laneId);
	}

	let selectedId = $state<string | null>(null);

	const selectedOnboarding = $derived(
		selectedId ? (ctx.filteredOnboardings.find((o) => o.id === selectedId) ?? null) : null
	);

	const sheetOpen = $derived(selectedOnboarding !== null);

	function handleSheetOpenChange(open: boolean) {
		if (!open) selectedId = null;
	}
</script>

<div class="flex h-full flex-col bg-background">
	{#if !ctx.canViewOnboarding}
		<main class="flex min-h-0 flex-1 overflow-auto p-3 sm:p-6">
			<Empty.Root>
				<Empty.Media variant="icon"><ShieldAlert /></Empty.Media>
				<Empty.Header>
					<Empty.Title>Access Restricted</Empty.Title>
					<Empty.Description>
						You don't have permission to view this area. Contact your organization admin for access.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		</main>
	{:else}
		<header class="flex shrink-0 items-center justify-between border-b border-border px-3 py-3 sm:px-6">
			<div class="flex items-center gap-3">
				<h1 class="text-lg font-semibold tracking-tight">Onboarding Pipeline</h1>
				{#if ctx.filteredOnboardings.length > 0}
					<Badge variant="secondary">{ctx.filteredOnboardings.length} active</Badge>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				{#if ctx.canManageConfig}
					<Button href={ctx.templatesUrl} variant="outline" size="sm">Templates</Button>
				{/if}
				<Button href={ctx.historyUrl} variant="outline" size="sm">History</Button>
				{#if ctx.canManageWorkflows}
					<Button size="sm" onclick={() => ctx.modals.open(MODAL_IDS.startOnboarding)} disabled={!ctx.hasTemplateSteps}>
						<UserPlus class="mr-1.5 h-3.5 w-3.5" />
						Start Onboarding
					</Button>
				{/if}
			</div>
		</header>

		<main class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3 sm:px-6 sm:py-4">
			{#if !ctx.hasTemplateSteps && ctx.onboardings.length > 0}
				<Alert.Root variant="warning">
					<TriangleAlert />
					<Alert.Title>Configuration Required</Alert.Title>
					<Alert.Description>
						No template steps are defined, so new onboardings cannot be started until a template is built.
					</Alert.Description>
					{#if ctx.canManageWorkflows}
						<Alert.Action>
							<Button href={ctx.templatesUrl} size="sm" variant="outline">Manage Templates</Button>
						</Alert.Action>
					{/if}
				</Alert.Root>
			{/if}

			{#if ctx.resyncError}
				<Alert.Root variant="destructive">
					<CircleAlert />
					<Alert.Title>Sync Problem</Alert.Title>
					<Alert.Description>{ctx.resyncError}</Alert.Description>
					<Alert.Action>
						<Button size="sm" variant="outline" onclick={() => (ctx.resyncError = null)}>Dismiss</Button>
					</Alert.Action>
				</Alert.Root>
			{/if}

			{#if ctx.filteredOnboardings.length === 0}
				{#if !ctx.hasTemplateSteps && ctx.onboardings.length === 0}
					{#if ctx.canManageWorkflows}
						<Empty.Root>
							<Empty.Media variant="icon"><ClipboardList /></Empty.Media>
							<Empty.Header>
								<Empty.Title>Set up onboarding</Empty.Title>
								<Empty.Description>
									Set up your onboarding template to get started. Define the requirements new members need to complete.
								</Empty.Description>
							</Empty.Header>
							<Empty.Content>
								<Button href={ctx.templatesUrl}>Set Up Template</Button>
							</Empty.Content>
						</Empty.Root>
					{:else}
						<Empty.Root>
							<Empty.Media variant="icon"><ClipboardList /></Empty.Media>
							<Empty.Header>
								<Empty.Title>Onboarding not configured</Empty.Title>
								<Empty.Description>Onboarding has not been configured yet.</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					{/if}
				{:else}
					<Empty.Root>
						<Empty.Media variant="icon"><ClipboardList /></Empty.Media>
						<Empty.Header>
							<Empty.Title>No active onboardings</Empty.Title>
							<Empty.Description>No active onboardings. Start one to begin tracking a new member.</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			{:else}
				<KanbanBoard.Root ariaLabel="Onboarding pipeline">
					{#each lanes as lane (lane.id)}
						{@const items = getOnboardingsForLane(lane.id)}
						<KanbanBoard.Column>
							<KanbanBoard.ColumnHeader label={lane.label} count={items.length} />
							<KanbanBoard.ColumnItems>
								{#each items as onboarding (onboarding.id)}
									<OnboardingKanbanCard
										{ctx}
										{onboarding}
										selected={selectedId === onboarding.id}
										onclick={() => (selectedId = selectedId === onboarding.id ? null : onboarding.id)}
									/>
								{/each}
							</KanbanBoard.ColumnItems>
						</KanbanBoard.Column>
					{/each}
				</KanbanBoard.Root>
			{/if}
		</main>

		{#if selectedOnboarding}
			<OnboardingDetailSheet
				{ctx}
				onboarding={selectedOnboarding}
				open={sheetOpen}
				onOpenChange={handleSheetOpenChange}
			/>
		{/if}
	{/if}
</div>
