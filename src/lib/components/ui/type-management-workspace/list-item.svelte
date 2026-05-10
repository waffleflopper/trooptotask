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
</script>

<li data-slot="type-management-workspace-list-item-shell" class="border-b border-border/70 last:border-b-0">
	<div
		bind:this={ref}
		data-slot="type-management-workspace-list-item"
		data-selected={selected || undefined}
		class={cn(
			'group flex min-w-0 items-center gap-2 bg-transparent p-3 text-sm',
			'transition-colors hover:bg-muted/40',
			selected && 'bg-muted/50 ring-1 ring-inset ring-ring/25',
			disabled && 'opacity-70',
			className
		)}
		{...restProps}
	>
		<button
			type="button"
			class="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed"
			onclick={onselect}
			{disabled}
		>
			{#if color}
				<span
					data-slot="type-management-workspace-swatch"
					class="size-3 shrink-0 rounded-sm border border-border/60"
					style:background-color={color}
				></span>
			{/if}
			<span class="grid min-w-0 gap-1">
				<span class="truncate text-sm font-semibold text-foreground">{title}</span>
				{#if description}
					<span class="truncate text-xs text-muted-foreground">{description}</span>
				{/if}
			</span>
		</button>
		{#if actions}
			<div
				data-slot="type-management-workspace-list-item-actions"
				class="ml-auto flex shrink-0 items-center gap-1"
				role="toolbar"
				tabindex="-1"
			>
				{@render actions()}
			</div>
		{/if}
	</div>
</li>
