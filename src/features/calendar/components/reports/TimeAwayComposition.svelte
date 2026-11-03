<script lang="ts">
	import type { StatusType } from '$features/calendar/contracts';
	import { niceScale, type TimeAwayReport } from '../../utils/timeAway';
	import TimeAwayBar from './TimeAwayBar.svelte';

	interface Props {
		report: TimeAwayReport;
		statusTypes: readonly StatusType[];
	}

	let { report, statusTypes }: Props = $props();

	const statusById = $derived(new Map(statusTypes.map((status) => [status.id, status])));
	const rows = $derived(report.groups.flatMap((set) => [set.top, ...set.below]));
	const scale = $derived(niceScale(Math.max(report.averagePerPerson, ...rows.map((row) => row.perPerson))));
	const perPerson = (value: number) => value.toFixed(1);
	const statusName = (id: string) => statusById.get(id)?.name ?? 'Unknown';
	const percent = (share: number) => `${Math.round(share * 100)}%`;
</script>

<div class="min-w-0">
	{#if report.awayDays === 0}
		<p class="border-y border-border py-6 text-sm text-muted-foreground">No days away in this span.</p>
	{:else}
		<ul class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Status key">
			{#each report.byStatus as status (status.statusTypeId)}
				<li class="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
					<span
						class="size-2.5 rounded-[1px]"
						style:background-color={statusById.get(status.statusTypeId)?.color ?? '#999'}
						aria-hidden="true"
					></span>{statusName(status.statusTypeId)}
				</li>
			{/each}
		</ul>
		<TimeAwayBar
			class="h-9"
			segments={report.byStatus.map((status) => ({ statusTypeId: status.statusTypeId, value: status.days }))}
			max={report.awayDays}
			{statusTypes}
			label="Days away by status"
		/>
		<ul class="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Days away by status">
			{#each report.byStatus as status (status.statusTypeId)}
				<li class="min-w-0">
					<p class="font-heading text-2xl leading-none font-bold">{percent(status.share)}</p>
					<p class="mt-1 font-mono text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
						{statusName(status.statusTypeId)} · {status.days} d
					</p>
				</li>
			{/each}
		</ul>

		<div class="mt-8 border-t border-border pt-5">
			<div class="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h3 class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
					By group · days away per person
				</h3>
				<p class="inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
					<span class="h-3 border-l border-dashed border-foreground" aria-hidden="true"></span>
					Average {perPerson(report.averagePerPerson)} d
				</p>
			</div>
			<ul aria-label="Days away per person, by group">
				{#each rows as row (row.key)}
					<li
						class="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_3.25rem] items-center gap-x-3 gap-y-1 py-1.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3.5rem]"
					>
						<div class="min-w-0" style="padding-left: {row.level}rem">
							<p class="truncate font-serif text-[15px] font-medium">{row.label}</p>
							<p class="font-mono text-[11px] text-muted-foreground">
								{row.people}
								{row.people === 1 ? 'person' : 'people'}
							</p>
						</div>
						<TimeAwayBar
							class="h-4"
							segments={row.byStatus.map((status) => ({
								statusTypeId: status.statusTypeId,
								value: status.perPerson
							}))}
							max={scale.max}
							{statusTypes}
							marker={report.averagePerPerson}
							label="{row.label}, days away per person: {row.byStatus
								.map((status) => `${statusName(status.statusTypeId)} ${perPerson(status.perPerson)}`)
								.join(', ') || 'none'}"
						/>
						<p class="text-right font-heading text-lg leading-none font-bold">{perPerson(row.perPerson)}</p>
					</li>
				{/each}
			</ul>
			<div
				class="mt-1 grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_3.25rem] gap-x-3 font-mono text-[11px] text-muted-foreground sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3.5rem]"
				aria-hidden="true"
			>
				<span></span>
				<span class="relative h-4">
					{#each scale.ticks as tick (tick)}
						<span
							class="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
							style:left="{(tick / scale.max) * 100}%">{tick}</span
						>
					{/each}
				</span>
				<span class="text-right">days</span>
			</div>
		</div>
	{/if}
</div>
