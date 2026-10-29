<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import XIcon from '@lucide/svelte/icons/x';
	import type { ClassValue } from 'clsx';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import * as Sheet from '$lib/components/ui/sheet';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';
	import { cn } from '$lib/utils.js';
	import TreeSelectList from './tree-select-list.svelte';
	import type { TreeSelectOption } from './treeSelectRows.js';

	interface Props {
		options: readonly TreeSelectOption[];
		value: string | null;
		onValueChange: (id: string) => void;
		/** Names the control: the trigger's prefix and the sheet's title. */
		label: string;
		/** What the trigger shows. Null when the value names nothing, which shows `placeholder` in italic. */
		valueLabel: string | null;
		valueCount?: number;
		placeholder: string;
		searchPlaceholder: string;
		class?: ClassValue;
	}

	let {
		options,
		value,
		onValueChange,
		label,
		valueLabel,
		valueCount,
		placeholder,
		searchPlaceholder,
		class: className
	}: Props = $props();

	const isMobile = new IsMobile(640);
	let open = $state(false);
	// A reader with one choice has nothing to pick, so the control is just a label.
	const isStatic = $derived(options.length <= 1 && valueLabel !== null);

	function select(id: string) {
		open = false;
		if (id !== value) onValueChange(id);
	}
</script>

{#snippet triggerContent(touch: boolean)}
	<span class={cn('flex min-w-0 items-baseline', touch ? 'gap-1.5' : 'gap-2')}>
		<span class="shrink-0 text-muted-foreground">{label}:</span>
		{#if valueLabel === null}
			<span class="truncate font-medium italic">{placeholder}</span>
		{:else}
			<span class="truncate font-medium">{valueLabel}</span>
			{#if valueCount !== undefined}
				<span class={cn('shrink-0 font-mono text-muted-foreground tabular-nums', touch ? 'text-[11px]' : 'text-xs')}
					>{valueCount}</span
				>
			{/if}
		{/if}
	</span>
	<ChevronDownIcon class="size-3.5 shrink-0" aria-hidden="true" />
{/snippet}

{#if isStatic}
	<p class={cn('flex h-8 min-w-0 items-baseline gap-1.5 self-center px-1 py-1.5 text-sm', className)}>
		<span class="sr-only">{label}:</span>
		<span class="truncate font-semibold">{valueLabel}</span>
		{#if valueCount !== undefined}
			<span class="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{valueCount}</span>
		{/if}
	</p>
{:else if isMobile.current}
	<Sheet.Root bind:open>
		<Sheet.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					class={cn(
						'flex h-9 w-full min-w-0 items-center justify-between gap-1.5 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:border-accent',
						className
					)}
				>
					{@render triggerContent(true)}
				</button>
			{/snippet}
		</Sheet.Trigger>
		<Sheet.Content side="bottom" showCloseButton={false} class="max-h-[85dvh] gap-0 rounded-t-xl pb-5">
			<div class="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden="true"></div>
			<div class="flex shrink-0 items-center justify-between px-4 pt-2 pb-1">
				<Sheet.Title class="font-heading text-[22px] leading-7 font-bold uppercase">{label}</Sheet.Title>
				<Sheet.Close>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="icon" class="-mr-2 size-11">
							<XIcon class="size-4" aria-hidden="true" />
							<span class="sr-only">Close</span>
						</Button>
					{/snippet}
				</Sheet.Close>
			</div>
			<TreeSelectList {options} {value} onSelect={select} {searchPlaceholder} touch autofocus={false} />
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					class={cn(
						'flex h-8 max-w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:border-accent',
						className
					)}
				>
					{@render triggerContent(false)}
				</button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content align="start" class="max-h-[min(28rem,70dvh)] w-[340px] gap-0 rounded-md p-1">
			<TreeSelectList {options} {value} onSelect={select} {searchPlaceholder} touch={false} autofocus />
		</Popover.Content>
	</Popover.Root>
{/if}
