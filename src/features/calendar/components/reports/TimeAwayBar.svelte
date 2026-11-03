<script lang="ts">
	import type { StatusType } from '$features/calendar/contracts';

	interface Props {
		/** Stacked left to right; a segment's width is `value` over `max`. */
		segments: { statusTypeId: string; value: number }[];
		max: number;
		statusTypes: readonly StatusType[];
		/** Names the bar and its figures for assistive technology. */
		label: string;
		/** A dashed line at this value on the same scale. */
		marker?: number | null;
		class?: string;
	}

	let { segments, max, statusTypes, label, marker = null, class: className = 'h-3' }: Props = $props();

	const colorOf = (id: string) => statusTypes.find((status) => status.id === id)?.color ?? '#999';
	const percentOf = (value: number) => `${max > 0 ? (value / max) * 100 : 0}%`;
</script>

<div class="relative bg-foreground/10 {className}" role="img" aria-label={label}>
	<div class="flex h-full overflow-hidden">
		{#each segments as segment (segment.statusTypeId)}
			<span
				class="h-full shrink-0"
				style:width={percentOf(segment.value)}
				style:background-color={colorOf(segment.statusTypeId)}
			></span>
		{/each}
	</div>
	{#if marker !== null}
		<span
			class="pointer-events-none absolute -top-1 -bottom-1 border-l border-dashed border-foreground"
			style:left={percentOf(marker)}
			aria-hidden="true"
		></span>
	{/if}
</div>
