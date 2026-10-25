<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils.js';

	type Shared = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		label: string;
		/** The id of the control the label names, so the row reads as a form field. */
		labelFor?: string;
		/** Marks a field whose draft differs from the saved record. */
		changed?: boolean;
	};
	type Value = {
		/** A plain value; an empty one reads "Not set". Pass children for anything richer. */
		value?: string | null;
		mono?: boolean;
		hint?: string;
		error?: string;
		/** The value lane of a two-column row. */
		children?: Snippet;
	};
	type NoValue = { [K in keyof Value]?: never };
	type NoLanes = { holds?: never; control?: never; details?: never };
	type Display = {
		/** `display` sets the label in large condensed type over its `description`, for an editorial settings row. */
		variant: 'display';
		/** One sentence under the label on what the row controls or what changing it does. */
		description?: string;
		/** Mutes the label, for something that is switched off. */
		muted?: boolean;
		/** Where the label and value sit side by side; `xl` for a row that shares the width with a section nav. */
		stackBelow?: 'md' | 'xl';
	};

	/** `compact` keeps a narrow label beside its value at every width, for a facts card in a side rail. */
	type Props =
		| (Shared &
				Value &
				NoLanes & { variant?: 'default' | 'compact'; description?: never; muted?: never; stackBelow?: never })
		| (Shared & Value & NoLanes & Display)
		| (Shared &
				NoValue &
				Display & {
					/** The mono lane for what the row holds, between the label and the control. */
					holds?: Snippet;
					/** The control lane on the right, such as a switch or the saved state of a field. */
					control?: Snippet;
					/** A full-width area under the lanes, such as a field with its live sentence. */
					details?: Snippet;
				});

	let {
		label,
		variant = 'default',
		description,
		holds,
		control,
		muted = false,
		stackBelow = 'md',
		details,
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

	const lanes = $derived(holds !== undefined || control !== undefined || details !== undefined);
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
		variant === 'display' && 'py-6 last:border-b-0',
		lanes
			? cn(
					'gap-x-6 gap-y-3.5 md:items-start',
					holds ? 'md:grid-cols-[minmax(0,1fr)_11.25rem_auto]' : 'md:grid-cols-[minmax(0,1fr)_auto]'
				)
			: variant === 'display'
				? cn(
						'gap-x-10 gap-y-3',
						stackBelow === 'xl' ? 'xl:grid-cols-[18.75rem_minmax(0,1fr)]' : 'md:grid-cols-[18.75rem_minmax(0,1fr)]'
					)
				: variant === 'compact'
					? 'grid-cols-[6rem_minmax(0,1fr)] items-start gap-x-4 gap-y-1.5 py-2.5'
					: 'gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start',
		className
	)}
	{...restProps}
>
	{#if variant === 'display'}
		<dt class="grid content-start gap-1">
			<span
				class={cn(
					'flex items-center gap-1.5 font-heading text-[22px] leading-6 font-bold',
					muted ? 'text-muted-foreground' : 'text-foreground'
				)}
			>
				{@render labelText()}
			</span>
			{#if description}
				<span id={labelFor ? `${labelFor}-description` : undefined} class="text-sm text-muted-foreground"
					>{description}</span
				>
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
	{#if lanes}
		{#if holds}
			<dd class="min-w-0 font-mono text-xs leading-5 text-muted-foreground">{@render holds()}</dd>
		{/if}
		{#if control}
			<dd class="flex md:min-w-16 md:justify-end">{@render control()}</dd>
		{/if}
		{#if details}
			<dd class="min-w-0 md:col-span-full">{@render details()}</dd>
		{/if}
	{:else}
		<dd class={cn('min-w-0', variant === 'display' ? 'grid content-start gap-2.5' : 'self-center')}>
			{#if children}
				{@render children()}
			{:else if value}
				<span class={cn('wrap-anywhere', mono && 'font-mono text-sm')}>{value}</span>
			{:else}
				<span class="text-muted-foreground">Not set</span>
			{/if}
			{#if error}
				<p id={labelFor ? `${labelFor}-error` : undefined} role="alert" class="mt-1 text-xs text-destructive">
					{error}
				</p>
			{:else if hint}
				<p class="mt-1 text-xs text-muted-foreground">{hint}</p>
			{/if}
		</dd>
	{/if}
</div>
