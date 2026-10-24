<script lang="ts" module>
	import type { Component } from 'svelte';
	import type { PathnameWithSearchOrHash } from '$app/types';

	export type SectionNavCount = {
		value: number;
		/** Announced in place of the bare value, e.g. `2 pending requests`. */
		label: string;
	};

	export type SectionNavItem = {
		label: string;
		href: PathnameWithSearchOrHash;
		active?: boolean;
		/** Something waiting on the reader, in amber. Zero shows nothing; a promise shows a skeleton while pending. */
		count?: SectionNavCount | Promise<SectionNavCount>;
		/** A short trailing label, such as `Owner`. */
		tag?: string;
	};

	export type SectionNavGroup = {
		label: string;
		items: SectionNavItem[];
	};

	/** A command beside the sections, such as Sign out. `action` posts a form; `onclick` runs in place. */
	export type SectionNavAction = {
		label: string;
		icon?: Component<{ class?: string; 'aria-hidden'?: 'true' }>;
	} & ({ onclick: () => void; action?: never } | { action: PathnameWithSearchOrHash; onclick?: never });
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import type { RouteTabBadge, RouteTabItem } from '$lib/components/patterns/page-shell/index.js';
	import { cn } from '$lib/utils.js';

	type Props = {
		label: string;
		groups: SectionNavGroup[];
		/** Sits apart below a rule in the destructive color, for a section such as Danger zone. */
		apart?: SectionNavItem;
		/** Sits below a rule after the sections. Below `md` it becomes a row under the tabs. */
		actions?: SectionNavAction[];
		class?: string;
	};

	let { label, groups, apart, actions = [], class: className }: Props = $props();

	const id = $props.id();
	const pill = 'h-4.5 min-w-4.5 rounded-full px-1.25 font-mono text-[11px] tabular-nums';

	function tabBadge(count: SectionNavCount): RouteTabBadge | null {
		return count.value > 0 ? { value: count.value, label: count.label, variant: 'warning' } : null;
	}

	function tabCount(count: SectionNavItem['count']): RouteTabItem['badge'] {
		if (count instanceof Promise) return count.then(tabBadge);
		return (count && tabBadge(count)) ?? undefined;
	}

	const tabs = $derived<RouteTabItem[]>(
		[...groups.flatMap((group) => group.items), ...(apart ? [apart] : [])].map((item) => ({
			label: item.label,
			href: item.href,
			active: item.active,
			tag: item.tag,
			destructive: item === apart,
			badge: tabCount(item.count)
		}))
	);
</script>

{#snippet countBadge(count: SectionNavCount)}
	{#if count.value > 0}
		<Badge variant="warning" class={cn(pill, 'border-0 font-semibold')} aria-hidden="true">{count.value}</Badge>
		<span class="sr-only">{count.label}</span>
	{/if}
{/snippet}

{#snippet link(item: SectionNavItem, destructive = false)}
	<a
		data-slot="section-nav-link"
		href={resolve(item.href as '/')}
		aria-current={item.active ? 'page' : undefined}
		class={cn(
			'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm leading-[18px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
			item.active
				? 'border-border bg-muted font-semibold text-foreground'
				: 'border-transparent text-secondary-foreground hover:bg-muted/60 hover:text-foreground',
			destructive && 'text-destructive hover:text-destructive'
		)}
	>
		<span class="min-w-0 flex-1 truncate">{item.label}</span>
		{#await item.count}
			<Skeleton class="size-4.5 rounded-full" aria-hidden="true" />
			<span class="sr-only">count loading</span>
		{:then count}
			{#if count}{@render countBadge(count)}{/if}
		{:catch}
			<Badge variant="outline" class={pill} aria-hidden="true">–</Badge>
			<span class="sr-only">count unavailable</span>
		{/await}
		{#if item.tag}
			<span class="font-mono text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
				{item.tag}
			</span>
		{/if}
	</a>
{/snippet}

{#snippet actionControl(item: SectionNavAction, compact: boolean)}
	{@const linkClass =
		'flex w-full items-center gap-2 rounded-md border border-transparent px-2.5 py-1.5 text-left text-sm leading-[18px] text-secondary-foreground transition-colors outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'}
	{#if item.action}
		<form method="POST" action={resolve(item.action as '/')} class={compact ? 'contents' : undefined}>
			{#if compact}
				<Button type="submit" variant="ghost" size="sm">
					{item.label}
					{#if item.icon}<item.icon aria-hidden="true" />{/if}
				</Button>
			{:else}
				<button type="submit" class={linkClass}>
					<span class="min-w-0 flex-1 truncate">{item.label}</span>
					{#if item.icon}<item.icon class="size-3.5" aria-hidden="true" />{/if}
				</button>
			{/if}
		</form>
	{:else if compact}
		<Button type="button" variant="ghost" size="sm" onclick={item.onclick}>
			{item.label}
			{#if item.icon}<item.icon aria-hidden="true" />{/if}
		</Button>
	{:else}
		<button type="button" class={linkClass} onclick={item.onclick}>
			<span class="min-w-0 flex-1 truncate">{item.label}</span>
			{#if item.icon}<item.icon class="size-3.5" aria-hidden="true" />{/if}
		</button>
	{/if}
{/snippet}

<nav
	data-slot="section-nav"
	aria-label={label}
	class={cn('hidden w-45 shrink-0 flex-col gap-5 self-start pt-1 md:flex', className)}
>
	{#each groups as group, index (group.label)}
		<div role="group" aria-labelledby="{id}-{index}" class="flex flex-col gap-0.5">
			<p
				id="{id}-{index}"
				class="px-2.5 pb-2 font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
			>
				{group.label}
			</p>
			{#each group.items as item (item.href)}
				{@render link(item)}
			{/each}
		</div>
	{/each}
	{#if apart}
		<div class="border-t border-border pt-3.5">
			{@render link(apart, true)}
		</div>
	{/if}
	{#if actions.length}
		<div class="flex flex-col gap-0.5 border-t border-border pt-3.5">
			{#each actions as item (item.label)}
				{@render actionControl(item, false)}
			{/each}
		</div>
	{/if}
</nav>
<PageShell.Tabs items={tabs} {label} class={cn('md:hidden', className)} />
{#if actions.length}
	<div data-slot="section-nav-actions" class={cn('-mt-2 flex flex-wrap gap-1 md:hidden', className)}>
		{#each actions as item (item.label)}
			{@render actionControl(item, true)}
		{/each}
	</div>
{/if}
