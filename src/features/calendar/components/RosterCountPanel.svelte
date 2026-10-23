<script lang="ts">
	import type { AssignmentType } from '$features/calendar/contracts';
	import type { PlannerRosterStatus } from '$features/calendar/contexts/PlannerRosterRead.svelte';
	import type { RosterStanding, RosterView } from '$features/calendar/utils/plannerRosters';
	import type { Personnel } from '$features/personnel/contracts';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Table from '$lib/components/ui/table';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';

	interface Props {
		types: readonly AssignmentType[];
		typeId: string;
		status: PlannerRosterStatus;
		/** A refresh failed, so the counts shown may miss the latest write. */
		stale: boolean;
		roster: RosterView | undefined;
		personById: ReadonlyMap<string, Personnel>;
		/** The chosen roster's DA 6 for the shown month. */
		da6Href: string;
		onRetry: () => void;
	}

	let { types, typeId = $bindable(), status, stale, roster, personById, da6Href, onRetry }: Props = $props();

	const COLLAPSED_ROWS = 10;
	const TRACK_NAMES = { all: null, weekday: 'Weekdays', weekend: 'Weekends & holidays' } as const;
	const headClass =
		'h-8 py-0 px-[5px] font-mono text-[9.5px] font-normal tracking-wider text-muted-foreground uppercase';

	const type = $derived(types.find((candidate) => candidate.id === typeId));
	let expanded = $derived.by(() => {
		void typeId;
		return false;
	});
	const standings = $derived(roster?.current ?? []);
	const longest = $derived(Math.max(0, ...standings.map((standing) => standing.entries.length)));
	const excusedNote = $derived.by(() => {
		const names = (roster?.excused ?? []).map((id) => {
			const person = personById.get(id);
			return person ? `${person.rank} ${person.lastName}` : 'Someone outside your roster';
		});
		if (!names.length) return null;
		const list = new Intl.ListFormat('en', { type: 'conjunction' }).format(names);
		return `${list} ${names.length === 1 ? 'is' : 'are'} excused.`;
	});

	function chooseType(value: string) {
		// A single toggle group emits '' when the pressed item is clicked again.
		if (types.some((candidate) => candidate.id === value)) typeId = value;
	}

	function shown(standing: RosterStanding) {
		return expanded ? standing.entries : standing.entries.slice(0, COLLAPSED_ROWS);
	}
</script>

<section class="overflow-clip rounded-lg border bg-card" aria-labelledby="planner-roster-title">
	<header class="grid gap-2.5 border-b px-3.5 py-3">
		<h2
			id="planner-roster-title"
			class="font-mono text-[10.5px] leading-3.5 font-semibold tracking-widest text-muted-foreground uppercase"
		>
			Roster · count today
		</h2>
		<ToggleGroup.Root
			type="single"
			size="sm"
			aria-label="Duty roster"
			class="w-full flex-wrap"
			bind:value={() => typeId, chooseType}
		>
			{#each types as candidate (candidate.id)}
				<ToggleGroup.Item value={candidate.id} class="grow" aria-label={candidate.name} title={candidate.name}>
					{candidate.shortName}
				</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>
	</header>
	{#if status === 'error'}
		<div class="grid gap-2 px-3.5 py-3" role="alert">
			<p class="text-sm">Roster counts could not be loaded.</p>
			<Button variant="outline" size="sm" class="w-fit" onclick={onRetry}>Retry roster counts</Button>
		</div>
	{:else if status !== 'ready'}
		<div class="grid" role="status" aria-label="Loading roster counts">
			<div class="h-8 bg-muted"></div>
			{#each { length: COLLAPSED_ROWS }, row (row)}
				<div class="flex h-[38px] items-center gap-2 border-t px-3.5">
					<Skeleton class="h-3 w-7" />
					<Skeleton class="h-3.5 w-24" />
					<Skeleton class="ml-auto h-3 w-5" />
				</div>
			{/each}
		</div>
	{:else if !roster?.current?.length}
		<p class="px-3.5 py-3 text-sm text-muted-foreground">
			{roster ? 'This roster starts on a later day.' : 'This duty has no roster yet.'}
		</p>
	{:else}
		{#each standings as standing (standing.track)}
			{@const trackName = TRACK_NAMES[standing.track]}
			<Table.Root
				aria-label="{type?.name ?? 'Duty'} roster{trackName ? `, ${trackName}` : ''}"
				scrollRegionLabel="{type?.name ?? 'Duty'} roster{trackName ? `, ${trackName}` : ''}"
				class="table-fixed"
				containerClass="max-h-96 overflow-y-auto"
			>
				<Table.Header class="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--color-border)]">
					<Table.Row class="bg-muted hover:bg-muted">
						<Table.Head scope="col" class={[headClass, 'pl-3.5']}>{trackName ?? 'Up next'}</Table.Head>
						<Table.Head scope="col" class={[headClass, 'w-[72px] pr-3.5 text-right']}>Count</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each shown(standing) as entry (entry.personId)}
						{@const person = personById.get(entry.personId)}
						{@const today = roster.todayAssignee === entry.personId}
						<Table.Row class={['h-[38px]', entry.effect && 'text-muted-foreground']}>
							<Table.Head scope="row" class="h-auto py-0 pr-1 pl-3.5 font-normal break-words whitespace-normal">
								<span class="flex items-baseline gap-[5px]">
									{#if person?.rank}
										<span class="font-mono text-[10px] text-muted-foreground uppercase">{person.rank}</span>
									{/if}
									<span class={entry.effect ? '' : 'font-medium'}>{person?.lastName ?? 'Outside your roster'}</span>
								</span>
							</Table.Head>
							<Table.Cell class="py-0 pr-3.5 pl-[5px] text-right font-mono text-[11px] tabular-nums">
								{#if entry.effect}
									<span
										title="{entry.effect.reason}, count {entry.effect.code === 'A' ? 'holds' : 'runs'}"
										aria-hidden="true">{entry.effect.code} {entry.count}</span
									>
									<span class="sr-only">{entry.count}, {entry.effect.code}: {entry.effect.reason}</span>
								{:else if today}
									<span class="text-[10px] font-semibold tracking-wider text-primary uppercase">Today</span>
									<span class="sr-only">, count {entry.count}</span>
								{:else}
									{entry.count}
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/each}
		{#if longest > COLLAPSED_ROWS}
			<div class="border-t px-2 py-1.5">
				<Button type="button" variant="ghost" size="sm" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
					{expanded ? 'Show fewer' : `Show all ${longest}`}
				</Button>
			</div>
		{/if}
	{/if}
	{#if stale && status === 'ready'}
		<div class="flex items-center gap-2 border-t px-3.5 py-2" role="status">
			<p class="text-[13px] text-muted-foreground">These counts may miss the latest change.</p>
			<Button variant="ghost" size="xs" class="ml-auto" onclick={onRetry}>Refresh</Button>
		</div>
	{/if}
	<p class="border-t px-3.5 py-2.5 text-[13px] text-muted-foreground">
		{#if excusedNote && status === 'ready'}{excusedNote}{/if}
		<a href={da6Href} class="font-medium text-foreground underline underline-offset-2">Open the DA 6</a> to see every number.
	</p>
</section>
