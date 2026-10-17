<script lang="ts">
	import type { AssignmentType } from '$features/calendar/contracts';
	import type { DutyFairness } from '$features/calendar/utils/dutyFairness';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as Table from '$lib/components/ui/table';

	interface Props {
		types: readonly AssignmentType[];
		typeId: string;
		fairness: DutyFairness;
	}

	let { types, typeId = $bindable(), fairness }: Props = $props();

	const COLLAPSED_ROWS = 10;

	const isGroupType = $derived(fairness.type.assignTo === 'group');
	const listKey = $derived(`${fairness.type.id}:${fairness.window.end}`);
	let expanded = $derived.by(() => {
		void listKey;
		return false;
	});
	const hasMore = $derived(fairness.rows.length > COLLAPSED_ROWS);
	const shownRows = $derived(expanded ? fairness.rows : fairness.rows.slice(0, COLLAPSED_ROWS));
</script>

<section class="rounded-lg border bg-card" aria-labelledby="planner-fairness-title">
	<header class="grid gap-3 border-b px-4 py-3">
		<div class="grid gap-1">
			<h2 id="planner-fairness-title" class="font-mono text-xs font-semibold tracking-widest uppercase">Fairness</h2>
			<p id="planner-fairness-window" class="text-xs text-muted-foreground">
				Duties {fairness.window.label}, including this month's plan. Longest since last duty first.
			</p>
		</div>
		<Field.Root>
			<Field.Label for="planner-fairness-type">Duty type</Field.Label>
			<NativeSelect id="planner-fairness-type" size="sm" class="w-full" bind:value={typeId}>
				{#each types as type (type.id)}
					<option value={type.id}>{type.name}</option>
				{/each}
			</NativeSelect>
		</Field.Root>
	</header>
	{#if fairness.rows.length === 0}
		<p class="px-4 py-3 text-sm text-muted-foreground">
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
				<Table.Row class="bg-muted/40 hover:bg-muted/40">
					<Table.Head scope="col" class="h-8 px-2 font-mono text-xs tracking-wider uppercase">
						{isGroupType ? 'Group' : 'Name'}
					</Table.Head>
					<Table.Head scope="col" class="h-8 w-16 px-2 text-right font-mono text-xs tracking-wider uppercase">
						Duties
					</Table.Head>
					<Table.Head scope="col" class="h-8 w-24 px-2 font-mono text-xs tracking-wider uppercase">Last duty</Table.Head
					>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each shownRows as row (row.id)}
					{@const unavailable = row.kind === 'personnel' ? row.unavailable : undefined}
					<Table.Row>
						<Table.Head
							scope="row"
							class={[
								'h-auto px-2 py-1.5 font-normal break-words whitespace-normal',
								unavailable && 'text-muted-foreground'
							]}
						>
							<span class="flex items-baseline gap-1.5">
								{#if row.kind === 'personnel' && row.prefix}
									<span class="font-mono text-[10px] font-semibold text-muted-foreground uppercase">{row.prefix}</span>
								{/if}
								<span class={unavailable ? '' : 'font-medium'}>{row.label}</span>
							</span>
							{#if unavailable}
								<span class="block font-mono text-[10px] uppercase">
									<span class="sr-only">Unavailable:</span>
									{unavailable}
								</span>
							{/if}
						</Table.Head>
						<Table.Cell class={['px-2 py-1.5 text-right tabular-nums', unavailable && 'text-muted-foreground']}>
							{row.count}
						</Table.Cell>
						<Table.Cell class={['px-2 py-1.5 font-mono text-xs', unavailable && 'text-muted-foreground']}>
							{#if row.lastDuty}
								<time datetime={row.lastDuty.date}>{row.lastDuty.label}</time>
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
</section>
