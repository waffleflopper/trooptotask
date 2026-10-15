<script lang="ts" module>
	export type StatusBarLabel =
		| { readonly kind: 'one-day'; readonly text: string }
		| { readonly kind: 'name'; readonly text: string }
		| { readonly kind: 'name-note'; readonly name: string; readonly note: string };
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { StatusType } from '$features/calendar/contracts';
	import { cn } from '$lib/utils';

	interface Props extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
		status: Pick<StatusType, 'color' | 'textColor'>;
		label: StatusBarLabel;
		/** The entry starts before the visible days, so the start is square with a chevron. */
		continuesBefore?: boolean;
		continuesAfter?: boolean;
	}

	let { status, label, continuesBefore = false, continuesAfter = false, class: className, ...rest }: Props = $props();
</script>

<span
	data-slot="status-bar"
	class={cn(
		'flex h-7 min-w-0 items-center gap-1.5 overflow-clip rounded-md px-[7px] whitespace-nowrap',
		continuesBefore && 'rounded-l-none',
		continuesAfter && 'rounded-r-none',
		className
	)}
	style:background-color={status.color}
	style:color={status.textColor}
	{...rest}
>
	{#if continuesBefore}<ChevronLeft class="-mx-1 size-3 shrink-0" aria-hidden="true" />{/if}
	<span class="font-mono text-[10px] leading-3 font-semibold tracking-[0.04em] uppercase">
		{label.kind === 'name-note' ? label.name : label.text}
	</span>
	{#if label.kind === 'name-note'}
		<span class="min-w-0 truncate font-body text-[11px] leading-3 opacity-92">{label.note}</span>
	{/if}
	{#if continuesAfter}<ChevronRight class="-mx-1 ml-auto size-3 shrink-0" aria-hidden="true" />{/if}
</span>
