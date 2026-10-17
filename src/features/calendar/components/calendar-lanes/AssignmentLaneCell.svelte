<script lang="ts" module>
	export interface AssignmentLaneDay {
		readonly dateLabel: string;
		readonly typeName: string;
		readonly assignee?: { readonly short: string; readonly full: string };
		readonly open?: (anchor: HTMLElement) => void;
		readonly edit?: () => void;
	}
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	let { value }: { value: AssignmentLaneDay } = $props();

	const action = $derived(value.assignee ? value.edit : value.open);
</script>

{#if action}
	<!-- One button for both states keeps focus on the day when an assignment lands. -->
	<Button
		variant="cell"
		size="none"
		class={[
			'size-full min-w-0 overflow-hidden px-px font-mono text-[9px] font-semibold tracking-wide uppercase hover:bg-primary/10',
			value.assignee ? 'text-foreground' : 'text-primary'
		]}
		aria-label={value.assignee
			? `${value.typeName} for ${value.dateLabel}: ${value.assignee.full}. Edit assignments`
			: `Assign ${value.typeName} for ${value.dateLabel}`}
		title={value.assignee?.full}
		onclick={(event) => (value.assignee ? value.edit?.() : value.open?.(event.currentTarget))}
	>
		{#if value.assignee}
			<span class="truncate">{value.assignee.short}</span>
		{:else}
			<span
				class="flex h-4 w-5 items-center justify-center rounded-[3px] border border-dashed border-primary text-xs leading-none"
				aria-hidden="true">+</span
			>
		{/if}
	</Button>
{:else if value.assignee}
	<span
		class="flex size-full min-w-0 items-center justify-center overflow-hidden px-px font-mono text-[9px] font-semibold tracking-wide text-foreground"
		title={value.assignee.full}
		><span class="truncate uppercase" aria-hidden="true">{value.assignee.short}</span><span class="sr-only"
			>{value.typeName} for {value.dateLabel}: {value.assignee.full}</span
		></span
	>
{/if}
