<script lang="ts">
	interface Props {
		code: string;
		/** The type color outlines the chip; the code stays in the foreground color so any color reads. */
		color: string;
		size?: 'marker' | 'row';
		/** Names a marker. A chip beside its type's name needs none. */
		label?: string;
		onclick?: () => void;
	}

	let { code, color, size = 'marker', label, onclick }: Props = $props();

	const chip = $derived([
		'overflow-hidden rounded-[2px] border bg-card font-mono font-extrabold text-ellipsis whitespace-nowrap text-foreground uppercase',
		size === 'marker'
			? 'max-w-full px-[3px] text-[8px] leading-[1.3]'
			: 'flex h-5 min-w-8 shrink-0 items-center justify-center px-1 text-[10px]'
	]);
</script>

{#if onclick}
	<button
		type="button"
		class={[
			chip,
			'pointer-events-auto cursor-pointer hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
		]}
		style:border-color={color}
		aria-label={label}
		title={label}
		{onclick}>{code}</button
	>
{:else}
	<span class={chip} style:border-color={color} title={label || undefined} aria-hidden="true">{code}</span>
{/if}
