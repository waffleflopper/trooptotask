<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils.js';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		label: string;
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

<div
	data-slot="fact-row"
	class={cn(
		'grid gap-x-4 gap-y-1.5 border-b border-border py-2.5 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start',
		className
	)}
	{...restProps}
>
	<dt
		class={cn(
			'flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground',
			changed && 'font-semibold text-foreground'
		)}
	>
		{#if labelFor}
			<Label for={labelFor} class="text-sm leading-normal font-[inherit]">{label}</Label>
		{:else}
			{label}
		{/if}
		{#if changed}
			<span class="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true"></span>
			<span class="sr-only">changed</span>
		{/if}
	</dt>
	<dd class="min-w-0 self-center">
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
