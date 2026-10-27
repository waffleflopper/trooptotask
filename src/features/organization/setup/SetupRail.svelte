<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { cn } from '$lib/utils.js';
	import SetupRailSteps from './SetupRailSteps.svelte';
	import { SETUP_GROUP_LABELS, getSetupFlow } from './setupFlow.svelte';

	const flow = getSetupFlow();
	const total = $derived(flow.rail.length);
	const reviewed = $derived(flow.model?.reviewed ?? null);
	const eyebrow = $derived(
		flow.current
			? `Step ${flow.position + 1} of ${total} · ${SETUP_GROUP_LABELS[flow.current.group]}`
			: 'Organization setup'
	);
	let stepsOpen = $state(false);
</script>

{#snippet finishLater()}
	<div class="flex flex-col gap-1 border-t border-border px-2.5 pt-4">
		<a href={resolve(flow.dashboardHref as '/')} class="w-fit text-sm leading-[18px] text-foreground underline">
			Finish later
		</a>
		<p class="text-xs leading-4 text-muted-foreground">Your answers are kept.</p>
	</div>
{/snippet}

<nav
	aria-label="Organization setup steps"
	class="hidden w-60 shrink-0 flex-col gap-7 self-start pb-10 lg:flex"
	data-testid="setup-rail"
>
	<div class="flex flex-col gap-2.5 px-2.5">
		<p class="font-heading text-[22px] leading-6 font-extrabold uppercase">Organization setup</p>
		<div class="flex items-baseline gap-2">
			{#if reviewed === null}
				<Skeleton class="h-4.5 w-12 self-center" aria-hidden="true" />
				<span class="sr-only">Loading progress</span>
			{:else}
				<span class="font-heading text-base leading-[18px] font-bold">{reviewed} of {total}</span>
			{/if}
			<span class="font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
				reviewed
			</span>
		</div>
		<div class="flex h-1 overflow-clip rounded-sm bg-border">
			<div class="bg-foreground" style:width="{((reviewed ?? 0) / total) * 100}%"></div>
		</div>
	</div>
	<div class="flex flex-col gap-7">
		<SetupRailSteps />
	</div>
	{#if flow.current}{@render finishLater()}{/if}
</nav>

<div class="flex flex-col gap-2.5 lg:hidden">
	<div class="flex items-center gap-2.5">
		<p
			class="min-w-0 flex-1 truncate font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
		>
			{eyebrow}
		</p>
		<Popover.Root bind:open={stepsOpen}>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="sm">
						All steps
						<ChevronDown data-icon="inline-end" aria-hidden="true" />
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="end" class="flex max-h-[70vh] w-72 flex-col gap-5 overflow-y-auto">
				<nav aria-label="Organization setup steps" class="flex flex-col gap-5">
					<SetupRailSteps onnavigate={() => (stepsOpen = false)} />
				</nav>
				{#if flow.current}{@render finishLater()}{/if}
			</Popover.Content>
		</Popover.Root>
	</div>
	<div class="flex gap-[3px]" aria-hidden="true">
		{#each flow.rail as step (step.key)}
			<div
				class={cn(
					'h-1 flex-1 rounded-[1px]',
					step.key === flow.stepKey
						? 'bg-accent'
						: step.state === null
							? 'bg-muted'
							: step.state === 'notAnswered'
								? 'bg-border'
								: 'bg-foreground'
				)}
			></div>
		{/each}
	</div>
	{#if reviewed !== null}<p class="sr-only">{reviewed} of {total} reviewed</p>{/if}
</div>
