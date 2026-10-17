<script lang="ts">
	import type { AssignmentType } from '$features/calendar/contracts';
	import { DUTY_LOOKBACK_DAYS } from '$features/calendar/utils/calendarRange';
	import { METER_CELLS, type DutyFairness } from '$features/calendar/utils/dutyFairness';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';

	interface Props {
		types: readonly AssignmentType[];
		typeId: string;
		fairness: DutyFairness;
	}

	let { types, typeId = $bindable(), fairness }: Props = $props();

	const COLLAPSED_ROWS = 10;
	const headClass =
		'h-8 py-0 px-[5px] font-mono text-[9.5px] font-normal tracking-wider text-muted-foreground uppercase';

	const isGroupType = $derived(fairness.type.assignTo === 'group');
	const listKey = $derived(`${fairness.type.id}:${fairness.window.end}`);
	let expanded = $derived.by(() => {
		void listKey;
		return false;
	});
	const hasMore = $derived(fairness.rows.length > COLLAPSED_ROWS);
	const shownRows = $derived(expanded ? fairness.rows : fairness.rows.slice(0, COLLAPSED_ROWS));

	function chooseType(value: string) {
		// A single toggle group emits '' when the pressed item is clicked again.
		if (types.some((type) => type.id === value)) typeId = value;
	}
</script>

<section class="overflow-clip rounded-lg border bg-card" aria-labelledby="planner-fairness-title">
	<header class="grid gap-2.5 border-b px-3.5 py-3">
		<h2
			id="planner-fairness-title"
			class="font-mono text-[10.5px] leading-3.5 font-semibold tracking-widest text-muted-foreground uppercase"
		>
			Fairness · {DUTY_LOOKBACK_DAYS} days
		</h2>
		<p id="planner-fairness-window" class="sr-only">
			Duties {fairness.window.label}, including this month's plan. Longest since last duty first.
		</p>
		<ToggleGroup.Root
			type="single"
			size="sm"
			aria-label="Duty type"
			class="w-full flex-wrap"
			bind:value={() => typeId, chooseType}
		>
			{#each types as type (type.id)}
				<ToggleGroup.Item value={type.id} class="grow" aria-label={type.name} title={type.name}>
					{type.shortName}
				</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>
	</header>
	{#if fairness.rows.length === 0}
		<p class="px-3.5 py-3 text-sm text-muted-foreground">
			{isGroupType ? 'No groups in your scope.' : 'No one is eligible for this duty.'}
		</p>
	{:else}
		<Table.Root
			aria-label="{fairness.type.name} fairness"
			aria-describedby="planner-fairness-window"
			scrollRegionLabel="{fairness.type.name} fairness"
			class="table-fixed"
			containerClass="max-h-96 overflow-y-auto"
		>
			<Table.Header class="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--color-border)]">
				<Table.Row class="bg-muted hover:bg-muted">
					<Table.Head scope="col" class={[headClass, 'pl-3.5']}>Longest since last</Table.Head>
					<Table.Head scope="col" class={[headClass, 'w-[55px]']}><span class="sr-only">Duties</span></Table.Head>
					<Table.Head scope="col" class={[headClass, 'w-[68px] pr-3.5 text-right']}>Last</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each shownRows as row (row.id)}
					{@const unavailable = row.kind === 'personnel' ? row.unavailable : undefined}
					<Table.Row class="h-[38px]">
						<Table.Head
							scope="row"
							class={[
								'h-auto py-0 pr-1 pl-3.5 font-normal break-words whitespace-normal',
								unavailable && 'text-muted-foreground'
							]}
						>
							<span class="flex items-baseline gap-[5px]">
								{#if row.kind === 'personnel'}
									{#if row.prefix}
										<span class="font-mono text-[10px] text-muted-foreground uppercase">{row.prefix}</span>
									{/if}
									<span class={unavailable ? '' : 'font-medium'} aria-hidden="true">{row.name}</span>
									<span class="sr-only">{row.label}</span>
								{:else}
									<span class="font-medium">{row.label}</span>
								{/if}
							</span>
						</Table.Head>
						<Table.Cell class="px-[5px] py-0">
							<span class="flex gap-[3px]" title="{row.count} {row.count === 1 ? 'duty' : 'duties'}">
								{#each { length: METER_CELLS }, cell (cell)}
									<span
										class={[
											'size-[9px] shrink-0 rounded-sm',
											cell < row.meter ? 'bg-destructive' : 'bg-border',
											unavailable && 'opacity-50'
										]}
										aria-hidden="true"
									></span>
								{/each}
							</span>
							<span class="sr-only">{row.count}</span>
						</Table.Cell>
						<Table.Cell class="py-0 pr-3.5 pl-[5px] text-right font-mono text-[10px] text-muted-foreground">
							{#if unavailable}
								<span title={unavailable.label} aria-hidden="true">{unavailable.code}</span>
								<span class="sr-only">Unavailable: {unavailable.label}</span>
							{:else if row.lastDuty}
								<time datetime={row.lastDuty.date} title={row.lastDuty.dateLabel}>{row.lastDuty.relative}</time>
							{:else}
								None
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
		{#if hasMore}
			<div class="border-t px-2 py-1.5">
				<Button type="button" variant="ghost" size="sm" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
					{expanded ? 'Show fewer' : `Show all ${fairness.rows.length}`}
				</Button>
			</div>
		{/if}
	{/if}
	{#if fairness.exemptNote}
		<p class="border-t px-3.5 py-2.5 text-[13px] text-muted-foreground">{fairness.exemptNote}</p>
	{/if}
</section>
