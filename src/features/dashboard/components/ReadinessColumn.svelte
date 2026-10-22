<script lang="ts">
	import { readinessBandTone } from '$lib/components/patterns/readiness-band';
	import type { ReadinessColumn, ReadinessTone } from '../sections/dashboardSections';

	let { column }: { column: ReadinessColumn } = $props();

	const TEXT: Record<ReadinessTone, string> = {
		good: readinessBandTone.good,
		warning: readinessBandTone.caution,
		critical: readinessBandTone.danger
	};
	const FILL: Record<ReadinessTone, string> = {
		good: 'bg-success',
		warning: 'bg-warning',
		critical: 'bg-destructive'
	};
</script>

<div class="flex h-full flex-col gap-3">
	<h3 class="font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-foreground uppercase">
		{column.title}
	</h3>
	{#if column.state === 'ready'}
		<p class="flex flex-wrap items-baseline gap-x-2">
			<span
				class={[
					'font-heading text-[56px] leading-[50px] font-extrabold tracking-[-0.02em]',
					column.figureTone ? TEXT[column.figureTone] : 'text-foreground'
				]}
			>
				{column.figure}
			</span>
			<span class="font-mono text-xs leading-4 text-muted-foreground">
				{column.suffix}{#if column.trend}<span aria-hidden="true"
						>{` · ${column.trend > 0 ? '▲' : '▼'} ${Math.abs(column.trend)} pts`}</span
					><span class="sr-only"
						>{`, ${column.trend > 0 ? 'up' : 'down'} ${Math.abs(column.trend)} points in 30 days`}</span
					>{/if}
			</span>
		</p>
		{#if column.graphic.kind === 'shares'}
			{@const shares = column.graphic.shares.filter((share) => share.count > 0)}
			<div
				class="flex h-2 shrink-0 gap-0.5"
				role="img"
				aria-label={column.graphic.shares.map((share) => `${share.count} ${share.label}`).join(', ')}
			>
				{#each shares as share (share.label)}
					<span class={['basis-0', FILL[share.tone]]} style:flex-grow={share.count}></span>
				{:else}
					<span class="flex-1 bg-border"></span>
				{/each}
			</div>
		{:else}
			<div class="relative flex h-2 shrink-0 items-center" aria-hidden="true">
				<span class="h-0.5 flex-1 bg-border"></span>
				{#each column.graphic.ticks as tick, index (tick.id)}
					<span
						class={['absolute top-0 h-2 w-[3px]', index === 0 ? 'bg-foreground' : 'bg-muted-foreground']}
						style:left="min({tick.offsetPercent}%, 100% - 3px)"
					></span>
				{/each}
			</div>
		{/if}
		<p class="flex-1 text-sm leading-5 text-secondary-foreground">{column.note}</p>
	{:else}
		<p class="flex-1 rounded-[4px] border border-dashed px-4 py-3 text-sm text-muted-foreground">
			Couldn't load {column.subject}. Reload the page to try again.
		</p>
	{/if}
	<a
		href={column.link.href}
		class="self-start text-sm leading-[18px] font-medium text-foreground underline decoration-1 underline-offset-2"
	>
		{column.link.label}
	</a>
</div>
