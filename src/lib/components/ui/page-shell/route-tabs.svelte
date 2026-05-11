<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { PathnameWithSearchOrHash, RouteIdWithSearchOrHash } from '$app/types';
	import { resolve } from '$app/paths';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge/index.js';
	import { cn } from '$lib/utils.js';

	export type RouteTabItem = {
		label: string;
		href?: RouteIdWithSearchOrHash | PathnameWithSearchOrHash;
		value?: string;
		active?: boolean;
		badge?: string | number;
		badgeVariant?: BadgeVariant;
		disabled?: boolean;
	};

	type Props = HTMLAttributes<HTMLElement> & {
		items?: RouteTabItem[];
		label?: string;
		value?: string;
		onValueChange?: (value: string) => void;
		children?: Snippet;
	};

	let {
		items = [],
		label = 'Route sections',
		value,
		onValueChange,
		children,
		class: className,
		...restProps
	}: Props = $props();

	function isActive(item: RouteTabItem) {
		return item.active ?? (value !== undefined && item.value === value);
	}
</script>

<nav data-slot="route-tabs" aria-label={label} class={cn('min-w-0 border-b border-border', className)} {...restProps}>
	<div class="flex min-w-0 items-center gap-1 overflow-x-auto">
		{#if children}
			{@render children()}
		{:else}
			{#each items as item (item.href ?? item.value ?? item.label)}
				{@const active = isActive(item)}
				{#if item.href && !item.disabled}
					<a
						data-slot="route-tab"
						data-active={active ? 'true' : undefined}
						href={resolve(item.href as '/')}
						aria-current={active ? 'page' : undefined}
						class={cn(
							'inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors',
							active
								? 'border-foreground text-foreground'
								: 'border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
						)}
					>
						<span>{item.label}</span>
						{#if item.badge !== undefined}
							<Badge variant={item.badgeVariant ?? 'secondary'}>{item.badge}</Badge>
						{/if}
					</a>
				{:else if item.href}
					<span
						data-slot="route-tab"
						aria-disabled="true"
						class="inline-flex h-10 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground opacity-50"
					>
						<span>{item.label}</span>
						{#if item.badge !== undefined}
							<Badge variant={item.badgeVariant ?? 'secondary'}>{item.badge}</Badge>
						{/if}
					</span>
				{:else}
					<button
						type="button"
						data-slot="route-tab"
						data-active={active ? 'true' : undefined}
						role="tab"
						aria-selected={active}
						disabled={item.disabled}
						onclick={() => item.value && onValueChange?.(item.value)}
						class={cn(
							'inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
							active
								? 'border-foreground text-foreground'
								: 'border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
						)}
					>
						<span>{item.label}</span>
						{#if item.badge !== undefined}
							<Badge variant={item.badgeVariant ?? 'secondary'}>{item.badge}</Badge>
						{/if}
					</button>
				{/if}
			{/each}
		{/if}
	</div>
</nav>
