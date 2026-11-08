<script lang="ts" module>
	export interface AssignmentLaneDay {
		readonly dateLabel: string;
		readonly typeName: string;
		readonly assignee?: { readonly short: string; readonly full: string };
		/** Why the assignee is unavailable this day, such as "Leave 20–23 Oct". */
		readonly unavailable?: string;
		readonly open?: (anchor: HTMLElement) => void;
		readonly edit?: () => void;
	}
</script>

<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { Button } from '$lib/components/ui/button';

	let { value }: { value: AssignmentLaneDay } = $props();

	const action = $derived(value.assignee ? value.edit : value.open);
	const assigneeName = $derived(
		value.assignee && value.unavailable
			? `${value.assignee.full}, unavailable: ${value.unavailable}`
			: value.assignee?.full
	);
	const title = $derived(
		value.assignee && value.unavailable
			? `${value.assignee.full}. Unavailable: ${value.unavailable}`
			: value.assignee?.full
	);
</script>

{#snippet name(assignee: { short: string })}
	<!-- The triangle sits above the name, so a 9px day cell keeps the whole surname. -->
	<span class="flex min-w-0 flex-col items-center gap-px leading-none">
		{#if value.unavailable}
			<TriangleAlertIcon class="size-2 shrink-0" aria-hidden="true" />
		{/if}
		<span class="max-w-full truncate">{assignee.short}</span>
	</span>
{/snippet}

{#if action}
	<!-- One button for both states keeps focus on the day when an assignment lands. -->
	<Button
		variant="cell"
		size="none"
		class={[
			'size-full min-w-0 overflow-hidden px-px font-mono text-[9px] font-semibold tracking-wide uppercase hover:bg-primary/10',
			value.assignee
				? value.unavailable
					? 'bg-destructive/10 text-destructive-text'
					: 'text-foreground'
				: 'text-primary'
		]}
		aria-label={value.assignee
			? `${value.typeName} for ${value.dateLabel}: ${assigneeName}. Edit assignments`
			: `Assign ${value.typeName} for ${value.dateLabel}`}
		{title}
		onclick={(event) => (value.assignee ? value.edit?.() : value.open?.(event.currentTarget))}
	>
		{#if value.assignee}
			{@render name(value.assignee)}
		{:else}
			<span
				class="flex h-4 w-5 items-center justify-center rounded-[3px] border border-dashed border-primary text-xs leading-none"
				aria-hidden="true">+</span
			>
		{/if}
	</Button>
{:else if value.assignee}
	<span
		class={[
			'flex size-full min-w-0 items-center justify-center overflow-hidden px-px font-mono text-[9px] font-semibold tracking-wide',
			value.unavailable ? 'bg-destructive/10 text-destructive-text' : 'text-foreground'
		]}
		{title}
		><span class="min-w-0 uppercase" aria-hidden="true">{@render name(value.assignee)}</span><span class="sr-only"
			>{value.typeName} for {value.dateLabel}: {assigneeName}</span
		></span
	>
{/if}
