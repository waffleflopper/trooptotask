<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import XIcon from '@lucide/svelte/icons/x';
	import type { ClassValue } from 'clsx';
	import { Button } from '$lib/components/ui/button';
	import { getFieldContext } from '$lib/components/ui/field/index.js';
	import * as Popover from '$lib/components/ui/popover';
	import * as Sheet from '$lib/components/ui/sheet';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';
	import { cn } from '$lib/utils.js';
	import TreeSelectList from './tree-select-list.svelte';
	import { toggleSelection, treeShape, type TreeSelectOption } from './treeSelectRows.js';

	type Selection =
		| { multiple?: false; value: string | null; onValueChange: (id: string) => void }
		/** Checkboxes. `value` and every change are canonical: no node is listed with one of its ancestors. */
		| { multiple: true; value: readonly string[]; onValueChange: (ids: string[]) => void };

	type Props = Selection & {
		options: readonly TreeSelectOption[];
		/** Names the control: the trigger's prefix and the sheet's title. */
		label: string;
		/** Keeps the trigger's prefix for screen readers only, for a form field that already shows its label. */
		hideLabel?: boolean;
		/** What the trigger shows. Null when the value names nothing, which shows `placeholder` in italic. */
		valueLabel: string | null;
		valueCount?: number;
		placeholder: string;
		searchPlaceholder: string;
		/** The trigger's id, for a field label. Inside a Field, the trigger also takes its description and error. */
		id?: string;
		class?: ClassValue;
	};

	let props: Props = $props();
	const {
		options,
		label,
		valueLabel,
		valueCount,
		placeholder,
		searchPlaceholder,
		id,
		class: className
	} = $derived(props);

	const field = getFieldContext();
	const fieldAria = $derived(field?.controlAria(undefined, undefined) ?? {});
	const isMobile = new IsMobile(640);
	let open = $state(false);
	const chosen = $derived(props.multiple ? props.value : props.value === null ? [] : [props.value]);
	// A reader with one choice has nothing to pick, so the control is just a label.
	const isStatic = $derived(!props.multiple && options.length <= 1 && valueLabel !== null);

	function select(id: string) {
		if (props.multiple) {
			props.onValueChange(toggleSelection(options, treeShape(options), props.value, id));
			return;
		}
		open = false;
		if (id !== props.value) props.onValueChange(id);
	}
</script>

{#snippet triggerContent(touch: boolean)}
	<span class={cn('flex min-w-0 items-baseline', touch ? 'gap-1.5' : 'gap-2')}>
		<span class={cn('shrink-0 text-muted-foreground', props.hideLabel && 'sr-only')}>{label}:</span>
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
					{id}
					{...fieldAria}
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
			<TreeSelectList
				{options}
				value={chosen}
				multiple={!!props.multiple}
				onSelect={select}
				{searchPlaceholder}
				touch
				autofocus={false}
			/>
			{#if props.multiple}
				<div class="shrink-0 px-4 pt-3">
					<Button class="h-11 w-full" onclick={() => (open = false)}>Done</Button>
				</div>
			{/if}
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					{id}
					{...fieldAria}
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
			<TreeSelectList
				{options}
				value={chosen}
				multiple={!!props.multiple}
				onSelect={select}
				{searchPlaceholder}
				touch={false}
				autofocus
			/>
		</Popover.Content>
	</Popover.Root>
{/if}
