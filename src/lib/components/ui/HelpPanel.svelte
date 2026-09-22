<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { helpStore } from '$lib/stores/help.svelte';

	type HelpTopic = {
		id: string;
		title: string;
		description: string;
		items: string[];
	};

	const topics: HelpTopic[] = [
		{
			id: 'dashboard',
			title: 'Dashboard help',
			description: 'Use the dashboard for unit-level readiness, upcoming losses, and daily work cues.',
			items: [
				'Review the top summary first.',
				'Use pinned groups to narrow repeated checks.',
				'Open detail pages for action work.'
			]
		},
		{
			id: 'personnel',
			title: 'Personnel help',
			description: 'Manage personnel records, groups, and basic duty information.',
			items: [
				'Keep rank, name, MOS, and group current.',
				'Archive records instead of deleting routine departures.',
				'Use bulk tools for roster cleanup.'
			]
		},
		{
			id: 'calendar',
			title: 'Calendar help',
			description: 'Track availability, holidays, daily assignments, and calendar reporting.',
			items: [
				'Use assignment types for recurring Calendar assignments.',
				'Apply bulk status changes for ranges.',
				'Review reports before publishing coverage decisions.'
			]
		},
		{
			id: 'training',
			title: 'Training help',
			description: 'Track training requirements, completions, imports, and readiness reports.',
			items: [
				'Filter the matrix before large updates.',
				'Use imports for large completion batches.',
				'Review reports for expiring or missing records.'
			]
		},
		{
			id: 'onboarding',
			title: 'Onboarding help',
			description: 'Start packets, assign steps, and track new personnel progress.',
			items: [
				'Start from a configured template.',
				'Assign step owners when work needs follow-up.',
				'Complete packets only after active steps are done.'
			]
		},
		{
			id: 'critical-tasks',
			title: 'Critical Tasks help',
			description: 'Maintain ICTL tasks, log completions, and monitor annual proficiency.',
			items: [
				'Keep the task library scoped to the unit.',
				'Log completions from the matrix or detail view.',
				'Use reports to find risk before expiration.'
			]
		},
		{
			id: 'settings',
			title: 'Settings help',
			description: 'Manage organization settings, access, policies, and data exports.',
			items: [
				'Review access roles before changing members.',
				'Keep policy settings explicit.',
				'Use exports for audit and handoff workflows.'
			]
		}
	];

	const fallbackTopic: HelpTopic = {
		id: 'general',
		title: 'Platform help',
		description: 'Quick guidance for common Troop to Task workflows.',
		items: [
			'Use the main navigation to move between workspaces.',
			'Most changes save inside feature-specific dialogs.',
			'Press Escape to close sheets and dialogs.'
		]
	};

	const activeTopic = $derived(topics.find((topic) => topic.id === helpStore.activeTopic) ?? fallbackTopic);
</script>

<Sheet.Root bind:open={() => Boolean(helpStore.activeTopic), (open) => !open && helpStore.close()}>
	<Sheet.Content side="right" class="w-full overflow-y-auto sm:max-w-lg">
		<Sheet.Header class="border-b border-border px-4 pb-4">
			<Sheet.Title>{activeTopic.title}</Sheet.Title>
			<Sheet.Description>{activeTopic.description}</Sheet.Description>
		</Sheet.Header>

		<div class="grid gap-4 px-4 pb-5">
			<section class="grid gap-3 rounded-lg border bg-card p-4">
				<p class="font-mono text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Quick checks</p>
				<ul class="grid gap-2 text-sm text-foreground">
					{#each activeTopic.items as item (item)}
						<li class="flex gap-2">
							<span class="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true"></span>
							<span>{item}</span>
						</li>
					{/each}
				</ul>
			</section>
		</div>
	</Sheet.Content>
</Sheet.Root>
