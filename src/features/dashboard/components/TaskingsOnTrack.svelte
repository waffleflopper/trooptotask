<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { formatWeekdayDay } from '$lib/utils/dates';
	import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
	import { taskingsOnTrack } from '../sections/onDuty';

	let { model }: { model: DashboardScreenModel } = $props();

	const taskings = $derived(model.inputs.page.taskings);
	const rows = $derived(taskings.status === 'ready' ? taskingsOnTrack(model.inputs, taskings.attention.onTrack) : []);
</script>

{#if taskings.status !== 'off'}
	<section
		class="grid grid-cols-[minmax(0,1fr)] gap-2.5 pt-[18px]"
		aria-labelledby="dashboard-taskings-on-track"
		aria-busy={taskings.status === 'pending'}
	>
		<h3
			id="dashboard-taskings-on-track"
			class="font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
		>
			Taskings due · 7 days · on track
		</h3>
		{#if taskings.status === 'pending'}
			<div class="border-t border-foreground" aria-hidden="true">
				{#each { length: 3 }, index (index)}
					<div class="flex min-h-[46px] items-center gap-2.5 border-b border-border py-1.5">
						<Skeleton class="h-3 w-12" />
						<div class="grid flex-1 gap-1">
							<Skeleton class="h-3.5 w-[70%]" />
							<Skeleton class="h-3 w-24" />
						</div>
					</div>
				{/each}
			</div>
		{:else if taskings.status === 'failed'}
			<p class="border-t border-foreground py-3 text-sm text-destructive-text">Taskings could not be loaded.</p>
		{:else if rows.length === 0}
			<p class="border-t border-foreground py-3 text-sm text-muted-foreground">Nothing else is due this week.</p>
		{:else}
			<ul class="border-t border-foreground">
				{#each rows as row (row.taskingId)}
					<li class="flex min-h-[46px] items-center gap-2.5 border-b border-border py-1.5">
						<span class="w-12 shrink-0 font-mono text-xs leading-4 text-muted-foreground">
							{formatWeekdayDay(row.suspenseOn)}
						</span>
						<span class="grid min-w-0 flex-1 gap-px">
							<a
								href={row.href}
								class="truncate text-sm leading-[18px] text-foreground no-underline hover:underline focus-visible:underline"
							>
								{row.title}
							</a>
							<span
								class={[
									'truncate font-mono text-[11px] leading-[14px]',
									row.staffed ? 'text-success-foreground' : 'text-muted-foreground'
								]}
							>
								{row.detail}
							</span>
						</span>
					</li>
				{/each}
			</ul>
		{/if}
		<div>
			<a
				href="/org/{model.inputs.page.orgId}/calendar/taskings"
				class="text-sm leading-[18px] font-medium text-foreground underline decoration-1"
			>
				Events & Taskings
			</a>
		</div>
	</section>
{/if}
