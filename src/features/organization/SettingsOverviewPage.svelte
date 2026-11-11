<script lang="ts">
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import { resolve } from '$app/paths';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import {
		OVERVIEW_CHECKS,
		readOverviewChecks,
		summarizeOverview,
		type OverviewCheck,
		type OverviewCheckState,
		type OverviewResult,
		type OverviewSources
	} from './settingsOverview';

	let { orgUrlSegment, sources }: { orgUrlSegment: string; sources: OverviewSources } = $props();

	const reads = $derived(readOverviewChecks(sources));
	const results = OVERVIEW_CHECKS.map((_, index) => new StreamedValue<OverviewResult>(() => reads[index]));

	const states = $derived(
		results.map((result): OverviewCheckState => {
			const current = result.current;
			if (current.state === 'ready') return { count: current.value.count };
			return current.state === 'failed' ? 'failed' : 'pending';
		})
	);
	const summary = $derived(summarizeOverview(states));

	const href = (path: string) => resolve(`/org/${orgUrlSegment}/${path}` as '/');
	const total = (count: number, check: OverviewCheck) =>
		`${count.toLocaleString('en-US')} ${count === 1 ? check.unit.one : check.unit.many}`;
</script>

<div role="status" data-state={summary.kind} class="flex min-h-6 items-center text-base leading-6">
	{#if summary.kind === 'checking'}
		<Skeleton class="h-4 w-64 max-w-full" aria-hidden="true" />
		<span class="sr-only">Checking the unit</span>
	{:else if summary.kind === 'allSet'}
		<span><span class="font-semibold">All set.</span> Nothing in the unit needs attention.</span>
	{:else if summary.kind === 'attention'}
		<span class="font-semibold text-warning-foreground">
			{summary.checks}
			{summary.checks === 1 ? 'check needs' : 'checks need'} attention
		</span>
	{:else}
		<span>Some checks couldn't load, so this can't confirm the unit is all set.</span>
	{/if}
</div>

<PageShell.FactSection endRule>
	{#each OVERVIEW_CHECKS as check, index (check.key)}
		{@const current = results[index].current}
		{@const items = current.state === 'ready' ? (current.value.items ?? []) : []}
		{#snippet itemList()}
			<ul class="grid gap-2">
				{#each items as item (item.fix.path)}
					<li class="flex flex-wrap items-baseline gap-x-3 text-sm">
						<span class="text-muted-foreground">{item.text}</span>
						<a href={href(item.fix.path)} class="font-medium text-foreground underline underline-offset-2"
							>{item.fix.label}</a
						>
					</li>
				{/each}
			</ul>
		{/snippet}
		<PageShell.FactRow
			variant="display"
			label={check.label}
			description={check.description}
			details={items.length > 0 ? itemList : undefined}
		>
			{#snippet holds()}
				{#if current.state === 'ready'}
					{#if current.value.count === 0}
						<span data-check-state="clear">None</span>
					{:else}
						<span data-check-state="outstanding" class="font-semibold text-warning-foreground"
							>{total(current.value.count, check)}</span
						>
						{#if current.value.breakdown}<span class="block">{current.value.breakdown}</span>{/if}
					{/if}
				{:else if current.state === 'failed'}
					<span data-check-state="failed">Couldn't load</span>
				{:else}
					<Skeleton class="my-[3px] h-3.5 w-24" aria-hidden="true" />
					<span class="sr-only">Loading</span>
				{/if}
			{/snippet}
			{#snippet control()}
				<span class="flex md:w-36 md:justify-end">
					{#if current.state === 'ready' && current.value.count > 0 && check.fix}
						<Button variant="link" class="-mr-2 -ml-2.5" href={href(check.fix.path)}>
							{check.fix.label}
							<ArrowUpRight data-icon="inline-end" aria-hidden="true" />
						</Button>
					{/if}
				</span>
			{/snippet}
		</PageShell.FactRow>
	{/each}
</PageShell.FactSection>
