<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { StatusType } from '$features/calendar/contracts';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatDayMonth } from '$lib/utils/dates';
	import { groupWhoIsOut } from '../../utils/availabilityBoard';
	import type { ForecastDay } from '../../utils/calendarReports';

	interface Props {
		day: ForecastDay;
		statusTypes: readonly StatusType[];
	}

	let { day, statusTypes }: Props = $props();

	const NAMES_SHOWN = 24;
	const groups = $derived(groupWhoIsOut(day, statusTypes));
	const expanded = new SvelteSet<string>();

	function toggle(statusTypeId: string): void {
		if (expanded.has(statusTypeId)) expanded.delete(statusTypeId);
		else expanded.add(statusTypeId);
	}

	function returnLabel(earliest: string | null, latest: string | null): string {
		if (earliest === null) return 'Away past range end';
		if (latest === null) return `Back ${formatDayMonth(earliest)} or later`;
		return earliest === latest
			? `Back ${formatDayMonth(earliest)}`
			: `Back ${formatDayMonth(earliest)} to ${formatDayMonth(latest)}`;
	}
</script>

{#if groups.length === 0}
	<p class="border-y border-border py-6 text-sm text-muted-foreground">Everyone is here on this day.</p>
{:else}
	<ul class="border-t border-border" aria-label="People away, by status">
		{#each groups as group (group.statusTypeId)}
			<li
				class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-1 border-b border-border py-3 sm:grid-cols-[6.5rem_3rem_minmax(0,1fr)_auto] sm:items-center"
			>
				<span
					class="inline-flex w-fit items-center rounded-[3px] px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.08em] uppercase"
					style:background-color={group.statusColor}
					style:color={group.statusTextColor}>{group.statusName}</span
				>
				<span class="font-heading text-2xl leading-none font-bold sm:text-center">{group.people.length}</span>
				<span class="col-span-2 min-w-0 font-serif text-[15px] leading-6 [overflow-wrap:anywhere] sm:col-span-1">
					{(expanded.has(group.statusTypeId) ? group.people : group.people.slice(0, NAMES_SHOWN))
						.map((away) => `${away.person.rank} ${away.person.lastName}`)
						.join(' · ')}
					{#if group.people.length > NAMES_SHOWN}
						<Button
							type="button"
							variant="link"
							size="xs"
							aria-expanded={expanded.has(group.statusTypeId)}
							onclick={() => toggle(group.statusTypeId)}
						>
							{expanded.has(group.statusTypeId) ? 'Show fewer' : `and ${group.people.length - NAMES_SHOWN} more`}
							<span class="sr-only">{group.statusName} names</span>
						</Button>
					{/if}
				</span>
				<span
					class="col-span-2 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase sm:col-span-1 sm:text-right"
				>
					{returnLabel(group.earliestReturn, group.latestReturn)}
				</span>
			</li>
		{/each}
	</ul>
{/if}
