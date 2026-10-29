<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { tick, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { cn } from '$lib/utils.js';
	import {
		ancestorsOf,
		impliedIds,
		treeShape,
		visibleRows,
		type TreeSelectOption,
		type TreeSelectRow
	} from './treeSelectRows.js';

	interface Props {
		options: readonly TreeSelectOption[];
		/** The chosen nodes: at most one unless `multiple`. */
		value: readonly string[];
		/** Rows carry checkboxes and stay open on a pick; nodes under a chosen node show as included. */
		multiple: boolean;
		onSelect: (id: string) => void;
		searchPlaceholder: string;
		touch: boolean;
		autofocus: boolean;
	}

	let { options, value, multiple, onSelect, searchPlaceholder, touch, autofocus }: Props = $props();

	const uid = $props.id();
	const shape = $derived(treeShape(options));
	const chosen = $derived(new Set(value));
	const implied = $derived(multiple ? impliedIds(shape, value) : new Set<string>());
	// A single pick opens on itself; several open only far enough to show each one.
	const expanded = new SvelteSet(
		untrack(() => {
			const initial = treeShape(options);
			return value.flatMap((id) => [...ancestorsOf(initial, id), ...(multiple ? [] : [id])]);
		})
	);
	let query = $state('');
	let activeId = $state<string | null>(untrack(() => value[0] ?? null));
	let list = $state<HTMLElement | null>(null);

	const rows = $derived(visibleRows(options, shape, expanded, query));
	const unavailable = (option: TreeSelectOption) => option.disabled || implied.has(option.id);
	const enabledRows = $derived(rows.filter((row) => !unavailable(row.option)));
	// A disabled row still takes arrow keys when it has children, so they can be opened; included rows only hold more of
	// the same.
	const reachableRows = $derived(
		rows.filter((row) => !unavailable(row.option) || (row.hasChildren && !implied.has(row.option.id)))
	);
	const active = $derived(
		rows.find((row) => row.option.id === activeId) ?? enabledRows.find((row) => row.match) ?? enabledRows[0] ?? null
	);
	const rowId = (id: string) => `${uid}-row-${id}`;
	const indent = (depth: number) => (touch ? Math.min(depth * 12, 24) : depth * 16);

	$effect(() => {
		const id = active?.option.id;
		if (!id || !list) return;
		void tick().then(() => list?.querySelector(`#${CSS.escape(rowId(id))}`)?.scrollIntoView({ block: 'nearest' }));
	});

	function toggle(row: TreeSelectRow) {
		if (!row.hasChildren || query) return;
		if (expanded.has(row.option.id)) expanded.delete(row.option.id);
		else expanded.add(row.option.id);
	}

	function move(step: 1 | -1) {
		if (reachableRows.length === 0) return;
		const index = active ? reachableRows.findIndex((row) => row.option.id === active.option.id) : -1;
		const next = index === -1 ? (step === 1 ? 0 : reachableRows.length - 1) : index + step;
		activeId = reachableRows[Math.max(0, Math.min(reachableRows.length - 1, next))].option.id;
	}

	function onkeydown(event: KeyboardEvent) {
		const row = active;
		switch (event.key) {
			case 'ArrowDown':
			case 'ArrowUp':
				event.preventDefault();
				move(event.key === 'ArrowDown' ? 1 : -1);
				return;
			case 'ArrowRight':
				if (query || !row?.hasChildren) return;
				event.preventDefault();
				if (row.expanded) move(1);
				else toggle(row);
				return;
			case 'ArrowLeft':
				if (query || !row) return;
				event.preventDefault();
				if (row.expanded) toggle(row);
				else if (row.parentId) activeId = row.parentId;
				return;
			case 'Enter':
				if (!row || unavailable(row.option)) return;
				event.preventDefault();
				onSelect(row.option.id);
				return;
		}
	}
</script>

<div class={cn('flex min-h-0 flex-1 flex-col', touch && 'gap-2')}>
	<div
		class={cn(
			'flex shrink-0 items-center',
			touch
				? 'mx-3 h-11 gap-2.5 rounded-md border border-border px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50'
				: 'h-9 gap-2 border-b border-border px-2'
		)}
	>
		<SearchIcon class={cn('shrink-0 text-muted-foreground', touch ? 'size-4' : 'size-3.5')} aria-hidden="true" />
		<!-- svelte-ignore a11y_autofocus -->
		<input
			type="text"
			role="combobox"
			aria-label={searchPlaceholder}
			aria-haspopup="tree"
			aria-expanded="true"
			aria-controls="{uid}-tree"
			aria-autocomplete="list"
			aria-activedescendant={active ? rowId(active.option.id) : undefined}
			placeholder={searchPlaceholder}
			autocomplete="off"
			{autofocus}
			class={cn(
				'min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground',
				touch ? 'text-base' : 'text-sm'
			)}
			bind:value={query}
			oninput={() => (activeId = null)}
			{onkeydown}
		/>
	</div>
	<div
		bind:this={list}
		id="{uid}-tree"
		role="tree"
		aria-label={searchPlaceholder}
		aria-multiselectable={multiple || undefined}
		tabindex="-1"
		class={cn('min-h-0 overflow-y-auto overscroll-contain', touch ? 'px-2' : 'pt-1')}
	>
		{#each rows as row (row.option.id)}
			{@const option = row.option}
			{@const included = implied.has(option.id)}
			{@const selected = chosen.has(option.id) || included}
			{@const blocked = unavailable(option)}
			{#if option.aside}
				<div role="none" class="my-1 border-t border-border"></div>
			{/if}
			<!-- Focus stays in the search field; the field names the active row through aria-activedescendant. -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				id={rowId(option.id)}
				role="treeitem"
				aria-level={option.depth + 1}
				aria-selected={selected}
				aria-expanded={row.hasChildren ? row.expanded : undefined}
				aria-disabled={blocked || undefined}
				data-active={active?.option.id === option.id || undefined}
				tabindex="-1"
				class={cn(
					'flex cursor-default items-center select-none',
					touch ? 'h-11 rounded-md px-1' : 'h-8 rounded-sm px-2',
					'data-active:bg-muted data-active:ring-1 data-active:ring-border data-active:ring-inset',
					selected && !multiple && 'bg-border data-active:bg-border',
					option.disabled && 'text-muted-foreground opacity-60'
				)}
				onmousedown={(event) => event.preventDefault()}
				onmouseenter={() => !blocked && (activeId = option.id)}
				onclick={() => !blocked && onSelect(option.id)}
			>
				<span class={cn('flex shrink-0 items-center justify-center', touch ? 'w-6' : 'w-4')}>
					{#if multiple}
						<span
							class={cn(
								'flex size-4 items-center justify-center rounded-[4px] border border-input',
								selected && 'border-primary bg-primary text-primary-foreground',
								included && 'opacity-50'
							)}
							aria-hidden="true"
						>
							{#if selected}<CheckIcon class="size-3.5" />{/if}
						</span>
					{:else if selected}
						<CheckIcon class={touch ? 'size-4' : 'size-3.5'} aria-hidden="true" />
					{/if}
				</span>
				<span class={cn('shrink-0', !touch && 'w-1.5')}></span>
				<span class="shrink-0" style:width="{indent(option.depth)}px"></span>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					class={cn('flex shrink-0 items-center justify-center text-muted-foreground', touch ? 'h-11 w-10' : 'h-8 w-4')}
					onclick={(event) => {
						if (!row.hasChildren || query) return;
						event.stopPropagation();
						toggle(row);
					}}
				>
					{#if row.hasChildren}
						{@const Chevron = row.expanded ? ChevronDownIcon : ChevronRightIcon}
						<Chevron class={touch ? 'size-3.5' : 'size-3'} aria-hidden="true" />
					{/if}
				</span>
				<span
					class={cn(
						'min-w-0 flex-1 truncate',
						touch ? 'text-base leading-5' : 'pl-1.5 text-sm leading-[18px]',
						selected && !included && 'font-semibold',
						included && 'text-muted-foreground',
						option.aside && 'italic'
					)}>{option.label}</span
				>
				{#if included}
					<span class="shrink-0 pl-2 text-xs text-muted-foreground">included</span>
				{/if}
				{#if option.count !== undefined}
					<span
						class={cn(
							'shrink-0 text-right font-mono text-xs tabular-nums',
							touch ? 'w-10 pr-2' : 'w-9',
							selected && !included ? 'text-foreground' : 'text-muted-foreground'
						)}>{option.count}</span
					>
				{/if}
			</div>
		{/each}
	</div>
</div>
