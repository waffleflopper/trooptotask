<script lang="ts">
	interface Props {
		/** Duties above fair share, negative when below. */
		difference: number;
		/** The difference that fills half the bar. */
		scale: number;
		label: string;
	}

	let { difference, scale, label }: Props = $props();

	const width = $derived(`${Math.min(Math.abs(difference) / scale, 1) * 50}%`);
</script>

<div class="relative h-3 bg-foreground/10" role="img" aria-label={label}>
	<span
		class={['absolute inset-y-0', difference > 0 ? 'left-1/2 bg-warning' : 'right-1/2 bg-foreground/35']}
		style:width
	></span>
	<span class="absolute -top-1 -bottom-1 left-1/2 border-l border-foreground" aria-hidden="true"></span>
</div>
