<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import MessageSquarePlusIcon from '@lucide/svelte/icons/message-square-plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Table from '$lib/components/ui/table';
	import type { PersonnelPageContext } from '../../contexts/PersonnelPageContext.svelte';
	import type { Personnel } from '../../personnel.types';
	import { lossBadgeLabel, rosterAttentionCell, rosterStatusDot } from '../../rosterSignals';
	import { focusAdjacentRow, type RosterRowControls } from './rosterRow';

	interface Props {
		person: Personnel;
		columns: ColumnDef<Personnel>[];
		ctx: PersonnelPageContext;
		controls: RosterRowControls;
	}

	let { person, columns, ctx, controls }: Props = $props();

	const name = $derived(`${person.rank} ${person.lastName}, ${person.firstName}`);
	const canOpen = $derived(ctx.canOpenPersonnelDetail(person));
	const canQuickEdit = $derived(ctx.canManagePersonnelRecord(person));
	const canArchive = $derived(ctx.canArchivePersonnelRecord(person));
	const selected = $derived(controls.selecting && canArchive && controls.isSelected(person.id));
	const tabbable = $derived(controls.tabRowId === person.id);
	const signal = $derived(ctx.signalRow(person));
	const dot = $derived(rosterStatusDot(signal, ctx.signals.statusTypes));
	const attention = $derived(rosterAttentionCell(signal));
	const loss = $derived(ctx.upcomingLossMap.get(person.id));

	function activate(): void {
		if (controls.selecting) controls.toggleSelected(person.id);
		else if (canOpen) controls.openRecord(person);
	}

	function handleClick(event: MouseEvent): void {
		if (DataTable.eventStartedInInteractiveDescendant(event)) return;
		activate();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
		const row = event.currentTarget as HTMLElement;
		const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
		if (key === 'ArrowDown' || key === 'ArrowUp') focusAdjacentRow(row, key === 'ArrowDown' ? 1 : -1);
		else if (key === 'Enter' || (key === ' ' && controls.selecting)) activate();
		else if (key === 'n' && canOpen && !controls.selecting) controls.note(person);
		else if (key === 'e' && canQuickEdit && !controls.selecting) controls.quickEdit(person);
		else return;
		event.preventDefault();
	}
</script>

<Table.Row
	data-roster-row={person.id}
	data-state={selected ? 'selected' : undefined}
	class="group/row cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
	tabindex={tabbable ? 0 : -1}
	aria-label={controls.selecting ? `Select ${person.rank} ${person.lastName}` : canOpen ? `Open ${name}` : name}
	onclick={handleClick}
	onkeydown={handleKeydown}
	onfocusin={() => controls.focused(person.id)}
>
	{#each columns as column (column.key)}
		<Table.Cell class={DataTable.columnCellClass(column)} style={column.width ? `width: ${column.width}` : undefined}>
			{#if column.key === 'select'}
				<DataTable.SelectionCheckbox
					checked={selected}
					disabled={!canArchive || controls.selectionBusy}
					ariaLabel={canArchive ? `Select ${name}` : `${name} cannot be archived`}
					onCheckedChange={canArchive ? () => controls.toggleSelected(person.id) : undefined}
				/>
			{:else if column.key === 'status'}
				{#if dot.kind === 'skeleton'}
					<Skeleton class="size-2 rounded-full" />
				{:else if dot.kind === 'present'}
					<span class="block size-2 rounded-full bg-success" role="img" aria-label="Present today" title="Present today"
					></span>
				{:else if dot.kind === 'away'}
					<span
						class="block size-2 rounded-full"
						style:background-color={dot.type.color}
						role="img"
						aria-label="{dot.type.name} today"
						title="{dot.type.name} today"
					></span>
				{/if}
			{:else if column.key === 'name'}
				<span class="flex min-w-0 items-center gap-2">
					{#if canOpen}
						<a
							href={controls.recordHref(person)}
							tabindex="-1"
							class="truncate font-semibold text-foreground hover:underline"
							data-sveltekit-preload-data="tap"
						>
							<span class="@xl/data-table:hidden">{person.rank}</span>
							{person.lastName}, {person.firstName}
						</a>
					{:else}
						<span class="truncate font-semibold">
							<span class="@xl/data-table:hidden">{person.rank}</span>
							{person.lastName}, {person.firstName}
						</span>
					{/if}
					{#if loss}
						<Badge
							variant={loss.triggerType === 'ETS' ? 'secondary' : 'outline'}
							class="shrink-0 font-mono"
							data-testid="loss-indicator-{person.id}"
						>
							{lossBadgeLabel(loss)}
						</Badge>
					{/if}
				</span>
			{:else if column.key === 'attention'}
				{#if attention.kind === 'skeleton'}
					<Skeleton class="h-3 w-24" />
				{:else if attention.kind === 'clear'}
					<span class="font-mono text-xs text-muted-foreground">—</span>
				{:else if attention.kind === 'item'}
					<span
						class={[
							'block truncate font-mono text-xs',
							attention.tone === 'red' ? 'text-danger-foreground' : 'text-warning-foreground'
						]}
						title={attention.text}>{attention.text}</span
					>
				{/if}
			{:else if column.key === 'actions'}
				<span class="flex items-center justify-end gap-1">
					{#if !controls.selecting}
						<span class="invisible flex gap-1 group-focus-within/row:visible group-hover/row:visible">
							{#if canOpen}
								<Button
									type="button"
									variant="outline"
									size="icon-sm"
									tabindex={tabbable ? 0 : -1}
									aria-label="Note for {name}"
									title="Note (N)"
									onclick={() => controls.note(person)}
								>
									<MessageSquarePlusIcon aria-hidden="true" />
								</Button>
							{/if}
							{#if canQuickEdit}
								<Button
									type="button"
									variant="outline"
									size="icon-sm"
									tabindex={tabbable ? 0 : -1}
									aria-label="Quick edit {name}"
									title="Quick edit (E)"
									onclick={() => controls.quickEdit(person)}
								>
									<PencilIcon aria-hidden="true" />
								</Button>
							{/if}
						</span>
					{/if}
					{#if canOpen}
						<ChevronRightIcon
							class="size-3.5 shrink-0 text-muted-foreground group-hover/row:text-foreground"
							aria-hidden="true"
						/>
					{/if}
				</span>
			{:else}
				{String(column.value(person) ?? '')}
			{/if}
		</Table.Cell>
	{/each}
</Table.Row>
