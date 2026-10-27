<script lang="ts">
	import type { Component } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { PathnameWithSearchOrHash } from '$app/types';
	import { resolve } from '$app/paths';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { cn } from '$lib/utils.js';

	export type RouteTabBadge = {
		value: string | number;
		/** Announced in place of the bare value, e.g. `2 pending requests`. */
		label?: string;
		variant?: BadgeVariant;
	};

	export type RouteTabItem = {
		label: string;
		href: PathnameWithSearchOrHash;
		active?: boolean;
		icon?: Component<{ class?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
		/** A streamed badge shows a skeleton while pending; `null` shows no badge. */
		badge?: RouteTabBadge | Promise<RouteTabBadge | null>;
		/** Sits apart at the end of the strip, for a secondary section such as Archived. */
		trailing?: boolean;
		/** A short trailing label, such as `Owner`. */
		tag?: string;
		/** The destructive color, for a section such as Danger zone. */
		destructive?: boolean;
		disabled?: boolean;
	};

	type Props = HTMLAttributes<HTMLElement> & {
		items?: RouteTabItem[];
		label?: string;
		/** `segmented` draws a few sibling pages as one track with the current page raised, beside other page controls. */
		variant?: 'underline' | 'segmented';
	};

	let { items = [], label = 'Route sections', variant = 'underline', class: className, ...restProps }: Props = $props();

	let scroller = $state<HTMLElement>();
	const activeIndex = $derived(items.findIndex((item) => item.active));
	const firstTrailing = $derived(items.find((item) => item.trailing));

	// Scrolls only the tab strip; scrollIntoView could also move the page.
	$effect(() => {
		void activeIndex;
		const tab = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
		if (!scroller || !tab) return;
		const strip = scroller.getBoundingClientRect();
		const target = tab.getBoundingClientRect();
		if (target.left < strip.left) scroller.scrollLeft += target.left - strip.left;
		else if (target.right > strip.right) scroller.scrollLeft += target.right - strip.right;
	});
</script>

{#snippet badgeValue(item: RouteTabItem, badge: RouteTabBadge)}
	{#if item.trailing}
		<span aria-hidden={badge.label ? 'true' : undefined}>· {badge.value}</span>
	{:else}
		<Badge variant={badge.variant ?? 'secondary'} aria-hidden={badge.label ? 'true' : undefined}>{badge.value}</Badge>
	{/if}
	{#if badge.label}<span class="sr-only">{badge.label}</span>{/if}
{/snippet}

{#snippet content(item: RouteTabItem)}
	{#if item.icon}
		<item.icon class="size-4" aria-hidden="true" />
	{/if}
	<span>{item.label}</span>
	{#if item.tag}
		<span class="font-mono text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{item.tag}</span>
	{/if}
	{#await item.badge}
		<Skeleton class="h-5 w-6" aria-hidden="true" />
		<span class="sr-only">count loading</span>
	{:then badge}
		{#if badge}{@render badgeValue(item, badge)}{/if}
	{:catch}
		{@render badgeValue(item, { value: '–', label: 'count unavailable', variant: 'outline' })}
	{/await}
{/snippet}

{#if variant === 'segmented'}
	<nav
		data-slot="route-tabs"
		aria-label={label}
		class={cn('flex h-8 w-fit shrink-0 items-center gap-0.5 rounded-lg bg-border p-[3px]', className)}
		{...restProps}
	>
		{#each items as item (item.href)}
			<a
				data-slot="route-tab"
				href={resolve(item.href as '/')}
				aria-current={item.active ? 'page' : undefined}
				class={cn(
					'inline-flex h-[26px] items-center rounded-md px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
					item.active
						? 'bg-background font-semibold text-foreground'
						: 'font-medium text-muted-foreground hover:text-foreground'
				)}
			>
				{item.label}
			</a>
		{/each}
	</nav>
{:else}
	<nav data-slot="route-tabs" aria-label={label} class={cn('min-w-0 border-b border-border', className)} {...restProps}>
		<div bind:this={scroller} class="flex min-w-0 items-center gap-1 overflow-x-auto">
			{#each items as item (item.href)}
				{#if item.disabled}
					<span
						data-slot="route-tab"
						aria-disabled="true"
						class={cn(
							'inline-flex h-10 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground opacity-50',
							item.trailing && 'gap-1.5 text-xs',
							item === firstTrailing && 'ml-auto'
						)}
					>
						{@render content(item)}
					</span>
				{:else}
					<a
						data-slot="route-tab"
						href={resolve(item.href as '/')}
						aria-current={item.active ? 'page' : undefined}
						class={cn(
							'inline-flex h-10 shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
							item.trailing && 'gap-1.5 text-xs',
							item === firstTrailing && 'ml-auto',
							item.destructive
								? item.active
									? 'border-destructive text-destructive'
									: 'border-transparent text-destructive hover:border-destructive/40'
								: item.active
									? 'border-foreground text-foreground'
									: 'border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
						)}
					>
						{@render content(item)}
					</a>
				{/if}
			{/each}
		</div>
	</nav>
{/if}
