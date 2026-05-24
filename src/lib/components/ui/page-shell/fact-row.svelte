<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Component } from 'svelte';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge/index.js';
	import { cn } from '$lib/utils.js';

	type FactTone = 'default' | 'muted' | 'warning' | 'success' | 'danger';
	type FactRowLayout = 'inline' | 'stack';

	type Props = HTMLAttributes<HTMLDivElement> & {
		label: string;
		value?: string | number;
		tone?: FactTone;
		layout?: FactRowLayout;
		icon?: Component;
		badge?: string | number;
		badgeVariant?: BadgeVariant;
		children?: Snippet;
	};

	let {
		label,
		value,
		tone = 'default',
		layout = 'inline',
		icon: Icon,
		badge,
		badgeVariant = 'secondary',
		children,
		class: className,
		role = 'listitem',
		...restProps
	}: Props = $props();

	const valueToneClass: Record<FactTone, string> = {
		default: 'text-foreground',
		muted: 'text-muted-foreground',
		warning: 'text-warning-foreground',
		success: 'text-success-foreground',
		danger: 'text-destructive'
	};
</script>

<div
	data-slot="fact-row"
	data-layout={layout}
	{role}
	class={cn(
		'grid text-sm',
		layout === 'inline' ? 'grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3' : 'min-w-0 content-start gap-1',
		className
	)}
	{...restProps}
>
	<span class="flex min-w-0 items-center gap-2 text-muted-foreground">
		{#if Icon}
			<Icon class="size-4 shrink-0" />
		{/if}
		<span class="min-w-0 break-words">{label}</span>
	</span>
	<span
		class={cn(
			'min-w-0 font-semibold break-words',
			layout === 'inline' ? 'justify-self-end text-right' : 'text-left',
			valueToneClass[tone]
		)}
	>
		{#if children}
			{@render children()}
		{:else if badge !== undefined}
			<Badge variant={badgeVariant}>{badge}</Badge>
		{:else}
			{value}
		{/if}
	</span>
</div>
