<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils.js';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		label: string;
		/** `display` sets the label in large condensed type over its `description`, for an editorial settings row. */
		variant?: 'default' | 'display';
		/** One sentence under a `display` label on what the row controls or what changing it does. */
		description?: string;
		/** The id of the control the label names, so the row reads as a form field. */
		labelFor?: string;
		/** A plain value; an empty one reads "Not set". Pass children for anything richer. */
		value?: string | null;
		mono?: boolean;
		/** Marks a field whose draft differs from the saved record. */
		changed?: boolean;
		hint?: string;
		error?: string;
		children?: Snippet;
	};

	let {
		label,
		variant = 'default',
		description,
		labelFor,
		value,
		mono = false,
		changed = false,
		hint,
		error,
		children,
		class: className,
		...restProps
	}: Props = $props();
</script>

{#snippet labelText()}
	{#if labelFor}
		<Label
			for={labelFor}
			class={variant === 'display'
				? 'text-[length:inherit] leading-[inherit] font-[inherit]'
				: 'text-sm leading-normal font-[inherit]'}>{label}</Label
		>
	{:else}
		{label}
	{/if}
	{#if changed}
		<span class="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true"></span>
		<span class="sr-only">changed</span>
	{/if}
{/snippet}

<div
	data-slot="fact-row"
	data-variant={variant}
	class={cn(
		'grid border-b border-border',
		variant === 'display'
			? 'gap-x-10 gap-y-3 py-6 last:border-b-0 md:grid-cols-[18.75rem_minmax(0,1fr)]'
			: 'gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start',
		className
	)}
	{...restProps}
>
	{#if variant === 'display'}
		<dt class="grid content-start gap-1">
			<span class="flex items-center gap-1.5 font-heading text-[22px] leading-6 font-bold text-foreground">
				{@render labelText()}
			</span>
			{#if description}
				<span class="text-sm text-muted-foreground">{description}</span>
			{/if}
		</dt>
	{:else}
		<dt
			class={cn(
				'flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground',
				changed && 'font-semibold text-foreground'
			)}
		>
			{@render labelText()}
		</dt>
	{/if}
	<dd class={cn('min-w-0', variant === 'display' ? 'grid content-start gap-2.5' : 'self-center')}>
		{#if children}
			{@render children()}
		{:else if value}
			<span class={cn('wrap-anywhere', mono && 'font-mono text-sm')}>{value}</span>
		{:else}
			<span class="text-muted-foreground">Not set</span>
		{/if}
		{#if error}
			<p id={labelFor ? `${labelFor}-error` : undefined} role="alert" class="mt-1 text-xs text-destructive">{error}</p>
		{:else if hint}
			<p class="mt-1 text-xs text-muted-foreground">{hint}</p>
		{/if}
	</dd>
</div>
