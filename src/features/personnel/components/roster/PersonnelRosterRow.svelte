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
	import PersonnelRosterEditRow from './PersonnelRosterEditRow.svelte';
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
	const canNote = $derived(ctx.canManagePersonnelRecord(person));
	const noteOpen = $derived(controls.noteOpenFor === person.id);
	const canQuickEdit = $derived(ctx.canManagePersonnelRecord(person));
	const canArchive = $derived(ctx.canArchivePersonnelRecord(person));
	const selected = $derived(controls.selecting && canArchive && controls.isSelected(person.id));
	const tabbable = $derived(controls.tabRowId === person.id);
	const signal = $derived(ctx.signalRow(person));
	const dot = $derived(rosterStatusDot(signal, ctx.signals.statusTypes));
	const attention = $derived(rosterAttentionCell(signal, controls.filter));
	const loss = $derived(ctx.upcomingLossMap.get(person.id));
	const session = $derived(controls.edit.session?.personnelId === person.id ? controls.edit.session : null);

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
		else if (key === 'n' && canNote && !controls.selecting) controls.note(person);
		else if (key === 'e' && canQuickEdit && !controls.selecting) controls.edit.open(person);
		else return;
		event.preventDefault();
	}
</script>

{#snippet attentionText()}
	{#if attention.kind === 'skeleton'}
		<Skeleton class="h-3 w-24" />
	{:else if attention.kind === 'clear'}
		<span class="font-mono text-xs text-muted-foreground">—</span>
	{:else if attention.kind === 'item'}
		{@const more = attention.more > 0 ? ` · ${attention.more} more` : ''}
		<span
			class={[
				'flex min-w-0 @xl/data-table:max-w-[calc(min(22rem,35cqw)-1rem)] font-mono text-xs whitespace-nowrap',
				attention.tone === 'red' ? 'text-danger-foreground' : 'text-warning-foreground'
			]}
			title="{attention.text}{more}"
			><span class="truncate">{attention.text}</span>{#if more}<span class="shrink-0 whitespace-pre">{more}</span
				>{/if}</span
		>
	{/if}
{/snippet}

<Table.Row
	data-roster-row={person.id}
	data-state={selected ? 'selected' : undefined}
	data-note-open={noteOpen || undefined}
	class={[
		'group/row cursor-pointer data-[note-open]:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
		session && 'border-b-0 bg-accent/10 hover:bg-accent/10'
	]}
	tabindex={tabbable ? 0 : -1}
	aria-label={controls.selecting ? `Select ${person.rank} ${person.lastName}` : canOpen ? `Open ${name}` : name}
	onclick={handleClick}
	onkeydown={handleKeydown}
	onfocusin={() => controls.focused(person.id)}
>
	{#each columns as column, index (column.key)}
		<Table.Cell
			class={[
				DataTable.columnCellClass(column),
				session && index === 0 && 'shadow-[inset_3px_0_0_0_var(--color-accent)]',
				column.key === 'name' && '@max-xl/data-table:w-full @max-xl/data-table:max-w-0'
			]}
			style={column.width ? `width: ${column.width}` : undefined}
		>
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
				<span class="grid min-w-0 gap-0.5">
					<span class="flex min-w-0 items-center gap-2">
						{#if canOpen}
							<a
								href={controls.recordHref(person)}
								tabindex="-1"
								class="truncate font-semibold text-foreground hover:underline"
								data-sveltekit-preload-data="tap"
							>
								<span class="@3xl/data-table:hidden">{person.rank}</span>
								{person.lastName}, {person.firstName}
							</a>
						{:else}
							<span class="truncate font-semibold">
								<span class="@3xl/data-table:hidden">{person.rank}</span>
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
						<!-- The actions column hides below md; Note and Quick edit stay reachable beside the name. -->
						{#if (canNote || canQuickEdit) && !controls.selecting}
							<span class="ml-auto flex shrink-0 gap-1 md:hidden">
								{#if canNote}
									<Button
										type="button"
										variant={noteOpen ? 'default' : 'outline'}
										size="icon-sm"
										tabindex={tabbable ? 0 : -1}
										aria-label="Note for {name}"
										aria-haspopup="dialog"
										aria-expanded={noteOpen}
										data-roster-note
										onclick={() => controls.note(person)}
									>
										<MessageSquarePlusIcon aria-hidden="true" />
									</Button>
								{/if}
								{#if canQuickEdit}
									<Button
										type="button"
										variant={session ? 'default' : 'outline'}
										size="icon-sm"
										tabindex={tabbable ? 0 : -1}
										aria-pressed={session ? true : false}
										aria-label="Quick edit {name}"
										onclick={() => controls.edit.toggle(person)}
									>
										<PencilIcon aria-hidden="true" />
									</Button>
								{/if}
							</span>
						{/if}
					</span>
					<!-- Below 36rem Needs attention folds under the name; the line keeps its height while loading. -->
					<span class="flex h-4 min-w-0 items-center @xl/data-table:hidden">{@render attentionText()}</span>
				</span>
			{:else if column.key === 'attention'}
				{@render attentionText()}
			{:else if column.key === 'actions'}
				<span class="flex items-center justify-end gap-1">
					{#if !controls.selecting}
						<!-- Hover reveals them; a touch screen has no hover, so they stay shown there. -->
						<span
							class={[
								'flex gap-1 group-focus-within/row:visible group-hover/row:visible [@media(hover:none)]:visible',
								noteOpen || session ? 'visible' : 'invisible'
							]}
						>
							{#if canNote}
								<Button
									type="button"
									variant={noteOpen ? 'default' : 'outline'}
									size="icon-sm"
									tabindex={tabbable ? 0 : -1}
									aria-label="Note for {name}"
									aria-haspopup="dialog"
									aria-expanded={noteOpen}
									data-roster-note
									title="Note (N)"
									onclick={() => controls.note(person)}
								>
									<MessageSquarePlusIcon aria-hidden="true" />
								</Button>
							{/if}
							{#if canQuickEdit}
								<Button
									type="button"
									variant={session ? 'default' : 'outline'}
									size="icon-sm"
									tabindex={tabbable ? 0 : -1}
									aria-pressed={session ? true : false}
									aria-label="Quick edit {name}"
									title="Quick edit (E)"
									onclick={() => controls.edit.toggle(person)}
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

{#if session}
	<PersonnelRosterEditRow {person} columnCount={columns.length} {ctx} edit={controls.edit} {session} />
{/if}
