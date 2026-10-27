<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import { resolve } from '$app/paths';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { cn } from '$lib/utils.js';
	import { SETUP_FACT_LABELS, SETUP_GROUP_LABELS, getSetupFlow, type SetupRailStep } from './setupFlow.svelte';

	let { onnavigate }: { onnavigate?: () => void } = $props();

	const flow = getSetupFlow();
	const id = $props.id();
	const groups = $derived(
		(Object.keys(SETUP_GROUP_LABELS) as SetupRailStep['group'][])
			.map((group) => ({ group, steps: flow.rail.filter((step) => step.group === group) }))
			.filter(({ steps }) => steps.length > 0)
	);
	const TAGS = { done: 'Done', later: 'Later', off: 'Off', notAnswered: '' } as const;
	const STATE_NAMES = { done: 'done', later: 'later', off: 'off', notAnswered: 'not answered' } as const;
</script>

{#each groups as { group, steps } (group)}
	<div role="group" aria-labelledby="{id}-{group}" class="flex flex-col gap-0.5">
		<p
			id="{id}-{group}"
			class="px-2.5 pb-2 font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
		>
			{SETUP_GROUP_LABELS[group]}
		</p>
		{#each steps as step (step.key)}
			{@const current = step.key === flow.stepKey}
			{@const off = step.state === 'off'}
			<a
				href={resolve(flow.href(step.slug) as '/')}
				aria-current={current ? 'step' : undefined}
				onclick={onnavigate}
				class={cn(
					'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm leading-[18px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
					current
						? 'border-border bg-muted font-semibold text-foreground'
						: 'border-transparent text-secondary-foreground hover:bg-muted/60 hover:text-foreground'
				)}
			>
				<span class="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
					{#if current}
						<span class="size-2 rounded-sm bg-accent"></span>
					{:else if step.state === null}
						<Skeleton class="size-3 rounded-full" />
					{:else if step.state === 'done'}
						<svg viewBox="0 0 16 16" class="size-4">
							<path
								d="M3.5 8.5l3 3 6-7"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="text-foreground"
							/>
						</svg>
					{:else if off}
						<span class="h-[1.5px] w-[9px] bg-muted-foreground/45"></span>
					{:else}
						<span class="size-2 rounded-full border-[1.5px] border-muted-foreground/45"></span>
					{/if}
				</span>
				<span class={cn('min-w-0 flex-1 truncate', off && 'text-muted-foreground line-through')}
					>{step.title}{#if step.state}<span class="sr-only">, {STATE_NAMES[step.state]}</span
						>{/if}{#if step.loadErrors.length}<span class="sr-only"
							>, {step.loadErrors.map(({ source }) => SETUP_FACT_LABELS[source]).join(' and ')} could not be loaded</span
						>{/if}</span
				>
				{#if step.loadErrors.length}
					<CircleAlert class="size-3.5 shrink-0 text-destructive-text" aria-hidden="true" />
				{/if}
				<span
					class="w-10 shrink-0 text-right font-mono text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
					aria-hidden="true"
				>
					{step.state ? TAGS[step.state] : ''}
				</span>
			</a>
		{/each}
	</div>
{/each}
