<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	interface Props extends WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
		selected?: boolean;
		disabled?: boolean;
		color?: string;
		title: string;
		description?: string | null;
		onselect?: () => void;
		actions?: Snippet;
	}

	let {
		ref = $bindable(null),
		class: className,
		selected = false,
		disabled = false,
		color,
		title,
		description,
		onselect,
		actions,
		...restProps
	}: Props = $props();

	const id = $props.id();

	function select(event: Event) {
		if (disabled || (event.target as HTMLElement).closest('[data-slot="type-management-workspace-list-item-actions"]'))
			return;
		onselect?.();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
		event.preventDefault();
		select(event);
	}
</script>

<div
	bind:this={ref}
	role="row"
	aria-selected={selected}
	aria-disabled={disabled || undefined}
	aria-labelledby="{id}-title"
	aria-describedby={description ? `${id}-description` : undefined}
	data-slot="type-management-workspace-list-item"
	data-selected={selected || undefined}
	class={cn(
		'group flex min-w-0 items-center gap-2 border-b border-border/70 bg-transparent p-3 text-sm outline-none last:border-b-0',
		'transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
		selected && 'bg-muted/50 ring-1 ring-ring/25 ring-inset',
		disabled && 'opacity-70',
		className
	)}
	onclick={select}
	{onkeydown}
	{...restProps}
>
	<div
		role="gridcell"
		class={cn('flex min-w-0 flex-1 items-center gap-3', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}
	>
		{#if color}
			<span
				data-slot="type-management-workspace-swatch"
				class="size-3 shrink-0 rounded-sm border border-border/60"
				style:background-color={color}
			></span>
		{/if}
		<span class="grid min-w-0 gap-1">
			<span id="{id}-title" class="truncate text-sm font-semibold text-foreground">{title}</span>
			{#if description}
				<span id="{id}-description" class="truncate text-xs text-muted-foreground">{description}</span>
			{/if}
		</span>
	</div>
	{#if actions}
		<div
			role="gridcell"
			data-slot="type-management-workspace-list-item-actions"
			class="ml-auto flex shrink-0 items-center gap-1"
		>
			{@render actions()}
		</div>
	{/if}
</div>
