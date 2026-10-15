<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { StatusType } from '$features/calendar/contracts';
	import type { BarLabel } from '$features/calendar/utils/barLayout';
	import { cn } from '$lib/utils';

	interface Props extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
		status: Pick<StatusType, 'color' | 'textColor'>;
		label: BarLabel;
		size?: 'regular' | 'lane' | 'compact';
		/** The entry starts before the visible days, so the start is square with a chevron. */
		continuesBefore?: boolean;
		continuesAfter?: boolean;
	}

	let {
		status,
		label,
		size = 'regular',
		continuesBefore = false,
		continuesAfter = false,
		class: className,
		...rest
	}: Props = $props();

	const text = $derived.by(() => {
		switch (label.kind) {
			case 'none':
				return '';
			case 'name-note':
				return label.name;
			case 'with-length':
				return `${label.text} · ${label.days}D`;
			default:
				return label.text;
		}
	});
</script>

<span
	data-slot="status-bar"
	class={cn(
		'flex h-7 min-w-0 items-center gap-1.5 overflow-clip rounded-md px-[7px] whitespace-nowrap',
		size !== 'regular' && 'gap-1 rounded-[3px] px-[5px]',
		continuesBefore && 'rounded-l-none',
		continuesAfter && 'rounded-r-none',
		className
	)}
	style:background-color={status.color}
	style:color={status.textColor}
	{...rest}
>
	{#if continuesBefore}<ChevronLeft class="-mx-1 size-3 shrink-0" aria-hidden="true" />{/if}
	{#if text}
		<span
			class={[
				'font-mono font-semibold tracking-[0.04em] uppercase',
				size === 'regular' && 'text-[10px] leading-3',
				size === 'lane' && 'text-[8.5px] leading-none',
				size === 'compact' && 'text-[9px] leading-[10px]'
			]}
		>
			{text}
		</span>
	{/if}
	{#if label.kind === 'name-note'}
		<span
			class={[
				'min-w-0 truncate font-body opacity-92',
				size === 'regular' ? 'text-[11px] leading-3' : 'text-[10px] leading-none'
			]}>{label.note}</span
		>
	{/if}
	{#if continuesAfter}<ChevronRight class="-mx-1 ml-auto size-3 shrink-0" aria-hidden="true" />{/if}
</span>
