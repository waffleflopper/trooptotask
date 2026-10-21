<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { formatWeekdayDay } from '$lib/utils/dates';
	import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
	import { comingAndGoing } from '../sections/onDuty';

	let { model }: { model: DashboardScreenModel } = $props();

	const PREVIEW = 4;

	let showAll = $state(false);

	const changes = $derived(comingAndGoing(model.inputs, 7));
	const visible = $derived(showAll ? changes : changes.slice(0, PREVIEW));
</script>

<section class="grid grid-cols-[minmax(0,1fr)] gap-2.5 pt-[18px]" aria-labelledby="dashboard-coming-and-going">
	<h3
		id="dashboard-coming-and-going"
		class="font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
	>
		Coming and going · 7 days
	</h3>
	{#if changes.length === 0}
		<p class="border-t border-foreground py-3 text-sm text-muted-foreground">No one leaves or returns this week.</p>
	{:else}
		<ul class="border-t border-foreground">
			{#each visible as change (change.id)}
				<li class="flex h-[38px] items-center gap-2.5 border-b border-border">
					<span class="w-12 shrink-0 font-mono text-xs leading-4 text-muted-foreground">
						{formatWeekdayDay(change.date)}
					</span>
					<span
						class={[
							'w-4 shrink-0 font-mono text-[13px] leading-4 font-semibold',
							change.direction === 'leaving' ? 'text-destructive' : 'text-success-foreground'
						]}
					>
						<span aria-hidden="true">{change.direction === 'leaving' ? '↓' : '↑'}</span>
						{#if change.direction === 'leaving'}<span class="sr-only">Leaving</span>{/if}
					</span>
					<span class="min-w-0 flex-1 truncate text-sm leading-[18px] text-foreground">{change.personName}</span>
					<span class="shrink-0 text-sm leading-[18px] text-muted-foreground">{change.label}</span>
				</li>
			{/each}
		</ul>
		{#if changes.length > PREVIEW && !showAll}
			<div>
				<Button variant="link" class="h-auto px-0 underline" onclick={() => (showAll = true)}>
					All {changes.length} changes
				</Button>
			</div>
		{/if}
	{/if}
</section>
