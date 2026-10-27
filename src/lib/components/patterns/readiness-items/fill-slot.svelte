<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { Spinner } from '$lib/components/ui/spinner';
	import { cn } from '$lib/utils.js';

	/** `selected` is a slot already filled; `warning` marks a slot whose person needs a second look. */
	export type FillSlotTone = 'default' | 'selected' | 'warning';

	interface Props extends Omit<HTMLButtonAttributes, 'class' | 'children'> {
		ref?: HTMLButtonElement | null;
		label: string;
		name: string;
		note: string;
		/** Amber when the note itself is the warning, such as a person on leave over the dates. */
		noteTone?: 'muted' | 'warning';
		/** A line under the note, for why the slot holds who it does. */
		detail?: string;
		tone?: FillSlotTone;
		busy?: boolean;
		busyLabel?: string;
	}

	let {
		ref = $bindable(null),
		label,
		name,
		note,
		noteTone = 'muted',
		detail,
		tone = 'default',
		busy = false,
		busyLabel = 'Opening',
		...restProps
	}: Props = $props();
</script>

<button
	bind:this={ref}
	type="button"
	data-slot="fill-slot"
	class={cn(
		'grid h-full w-full content-start gap-1 rounded-[4px] border py-2.5 pr-2.5 pl-3 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50',
		tone === 'selected' && 'border-foreground bg-muted',
		tone === 'warning' && 'border-accent bg-background hover:bg-muted/60',
		tone === 'default' && 'border-border bg-background hover:bg-muted/60'
	)}
	aria-busy={busy}
	{...restProps}
>
	<span class="flex items-center justify-between gap-2">
		<span
			class={cn(
				'font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] uppercase',
				tone === 'warning' ? 'text-accent-text' : 'text-muted-foreground'
			)}
		>
			{label}
		</span>
		{#if busy}
			<Spinner class="size-3 text-muted-foreground" aria-label={busyLabel} />
		{:else}
			<ChevronDownIcon class="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
		{/if}
	</span>
	<span class="text-[15px] leading-5 font-semibold wrap-anywhere text-foreground">{name}</span>
	<span
		class={cn(
			'font-mono text-[11px] leading-[14px]',
			noteTone === 'warning' ? 'text-accent-text' : 'text-muted-foreground'
		)}
	>
		{note}
	</span>
	{#if detail}
		<span class="text-[11px] leading-[14px] text-muted-foreground italic">{detail}</span>
	{/if}
</button>
