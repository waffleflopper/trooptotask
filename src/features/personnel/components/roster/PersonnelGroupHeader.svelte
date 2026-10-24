<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PinIcon from '@lucide/svelte/icons/pin';
	import { ProportionBar } from '$lib/components/patterns/proportion-bar';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Toggle } from '$lib/components/ui/toggle';
	import { SelectionCheckbox, type GroupHeaderContext } from '$lib/components/ui/data-table';
	import type { PersonnelPageContext } from '../../contexts/PersonnelPageContext.svelte';
	import type { Personnel } from '../../personnel.types';
	import type { CheckState } from './rosterSelection.svelte';

	interface Props {
		group: GroupHeaderContext;
		/** The People under this header, so the counts match the rows the header would show. */
		people: readonly Personnel[];
		ctx: PersonnelPageContext;
		pinned: boolean;
		unassigned: boolean;
		onTogglePin: (groupKey: string) => void;
		/** How much of the Group's shown People is selected; null hides the checkbox. */
		selection: { state: CheckState; set: (selected: boolean) => void } | null;
		/** Null hides "Note to everyone in the Group". */
		onNoteToEveryone: (() => void) | null;
	}

	let { group, people, ctx, pinned, unassigned, onTogglePin, selection, onNoteToEveryone }: Props = $props();

	const summary = $derived(ctx.summarizeSignals(people));
	const presence = $derived(
		summary.kind === 'ready' && summary.value.presence.kind === 'known'
			? { ...summary.value.presence.value, people: summary.value.people }
			: null
	);
	const attention = $derived(
		summary.kind === 'ready' && summary.value.attention.kind === 'known' ? summary.value.attention.value : null
	);
	const groupId = $derived(unassigned ? null : ctx.groupIdForName(group.key));
	const canEditGroup = $derived(groupId !== null && ctx.canManageGroups);
	const hasMenu = $derived(!unassigned);
	const segments = $derived(
		presence
			? [
					{ key: 'present', label: 'present', count: presence.present, color: 'var(--color-success)' },
					...presence.byStatus.map(({ type, count }) => ({
						key: type.id,
						label: type.name,
						count,
						color: type.color
					}))
				]
			: []
	);
</script>

<div
	class="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 @3xl/data-table:flex-nowrap"
	data-roster-group={group.key}
>
	<div class="flex min-w-0 flex-1 items-center gap-1">
		{#if selection}
			<span class="-ml-1 inline-flex w-6 shrink-0">
				<SelectionCheckbox
					checked={selection.state === 'all'}
					indeterminate={selection.state === 'some'}
					ariaLabel="Select everyone in {group.label}"
					onCheckedChange={selection.set}
				/>
			</span>
		{/if}
		{#if unassigned}
			<span class="w-8 shrink-0" aria-hidden="true"></span>
		{:else}
			<Toggle
				pressed={pinned}
				size="sm"
				class="shrink-0"
				data-pin-group={group.key}
				onPressedChange={() => onTogglePin(group.key)}
				title={pinned ? 'Unpin group' : 'Pin group to top'}
				aria-label={pinned ? `Unpin ${group.label}` : `Pin ${group.label}`}
			>
				<PinIcon class={pinned ? 'fill-accent text-accent' : 'text-chart-5'} aria-hidden="true" />
			</Toggle>
		{/if}
		<Button
			type="button"
			variant="ghost"
			class="h-8 min-w-0 gap-1.5 px-1.5 aria-expanded:bg-transparent"
			onclick={group.toggle}
			aria-expanded={!group.collapsed}
			aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} ${group.label}`}
		>
			<ChevronDownIcon class={['size-3 shrink-0', group.collapsed && '-rotate-90']} aria-hidden="true" />
			<span class="truncate font-heading text-xl leading-6 font-bold uppercase">{group.label}</span>
		</Button>
		<span class="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
			<span aria-hidden="true">{group.count}</span>
			<span class="sr-only">{group.count} {group.count === 1 ? 'person' : 'people'}</span>
		</span>
	</div>

	<div
		class="flex shrink-0 items-center gap-3 @max-3xl/data-table:order-last @max-3xl/data-table:w-full @max-3xl/data-table:shrink @max-3xl/data-table:flex-wrap @max-3xl/data-table:pl-1.5"
	>
		<div class="flex h-5 min-w-0 items-center gap-2.5 @3xl/data-table:w-60 @3xl/data-table:shrink-0">
			{#if summary.kind === 'pending'}
				<Skeleton class="h-1.5 w-20 shrink-0 rounded-[3px] @3xl/data-table:w-30" />
				<Skeleton class="h-3.5 w-24" />
			{:else if presence}
				<ProportionBar label="Strength today" {segments} class="w-20 @3xl/data-table:w-30" />
				<span class="truncate text-[13px] leading-[18px]">{presence.present} of {presence.people} present</span>
			{/if}
		</div>
		<div
			class="flex h-5 shrink-0 items-center font-mono text-xs whitespace-nowrap @3xl/data-table:w-[calc(min(22rem,35cqw)-2rem)]"
		>
			{#if unassigned && ctx.canManageGroups}
				<button
					type="button"
					class="rounded-xs underline underline-offset-2 hover:text-accent-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					onclick={() => ctx.openGroupEditor(null)}>Assign a Group</button
				>
			{:else if summary.kind === 'pending'}
				<Skeleton class="h-3 w-24" />
			{:else if attention}
				{#if attention.people === 0}
					<span class="text-muted-foreground"
						><span aria-hidden="true">—</span><span class="sr-only">None need attention</span></span
					>
				{:else}
					<span class={attention.worst === 'red' ? 'text-danger-foreground' : 'text-warning-foreground'}
						>{attention.people} {attention.people === 1 ? 'needs' : 'need'} attention</span
					>
				{/if}
			{/if}
		</div>
	</div>

	<div class="flex shrink-0 justify-end @max-3xl/data-table:order-2 @3xl/data-table:w-28">
		{#if hasMenu}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							type="button"
							variant="ghost"
							size="icon-sm"
							class="shrink-0"
							aria-label="Group actions for {group.label}"
						>
							<EllipsisIcon aria-hidden="true" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					{#if canEditGroup}
						<DropdownMenu.Item onSelect={() => ctx.openGroupEditor(groupId)}>Rename</DropdownMenu.Item>
						<DropdownMenu.Item onSelect={() => ctx.openGroupEditor(groupId)}>Add people</DropdownMenu.Item>
					{/if}
					{#if onNoteToEveryone}
						<DropdownMenu.Item onSelect={onNoteToEveryone}>Note to everyone in the Group</DropdownMenu.Item>
					{/if}
					<DropdownMenu.Item onSelect={() => onTogglePin(group.key)}>
						{pinned ? 'Unpin' : 'Pin'}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	</div>
</div>
