<script lang="ts">
	import { PACKET_ROW_COLUMNS } from './layout';
	import type { PacketOutcome } from './types';

	interface Props {
		name: string;
		meta: string;
		template: string;
		dates: string;
		took: string;
		/** Took well past the typical time. */
		tookLong: boolean;
		final: string;
		/** The packet stopped before every step was done. */
		finalShort: boolean;
		outcome: PacketOutcome;
	}

	let { name, meta, template, dates, took, tookLong, final, finalShort, outcome }: Props = $props();

	const cell = 'grid min-w-0 content-start gap-0.5';
	// The header names these columns on wide screens; stacked rows name them in place.
	const label = 'font-mono text-xs tracking-wider text-muted-foreground uppercase md:sr-only';
</script>

<span
	data-slot="onboarding-packet-summary"
	class={['grid min-w-0 flex-1 grid-cols-6 items-center gap-x-4 gap-y-2', PACKET_ROW_COLUMNS]}
>
	<span class="col-span-6 grid min-w-0 gap-0.5 md:col-span-1">
		<span class="truncate font-semibold text-foreground">{name}</span>
		<span class="truncate text-sm text-muted-foreground">{meta}</span>
	</span>
	<span class={[cell, 'col-span-3 md:col-span-1']}>
		<span class={label}>Template</span>
		<span class="truncate text-sm text-foreground">{template}</span>
	</span>
	<span class={[cell, 'col-span-3 md:col-span-1']}>
		<span class={label}>Dates</span>
		<span class="font-mono text-xs text-foreground">{dates}</span>
	</span>
	<span class={[cell, 'col-span-2 md:col-span-1 md:text-right']}>
		<span class={label}>Took</span>
		<span class={['font-mono text-xs font-medium', tookLong ? 'text-warning-foreground' : 'text-foreground']}
			>{took}</span
		>
	</span>
	<span class={[cell, 'col-span-2 md:col-span-1 md:text-right']}>
		<span class={label}>Final</span>
		<span class={['font-mono text-xs', finalShort ? 'text-warning-foreground' : 'text-foreground']}>{final}</span>
	</span>
	<span class={[cell, 'col-span-2 md:col-span-1']}>
		<span class={label}>Outcome</span>
		<span
			class={[
				'flex items-center gap-1.5 text-sm',
				outcome === 'completed' ? 'text-success-foreground' : 'text-muted-foreground'
			]}
		>
			<span
				aria-hidden="true"
				class={['size-2 shrink-0 rounded-full', outcome === 'completed' ? 'bg-success' : 'bg-muted-foreground']}
			></span>
			{outcome === 'completed' ? 'Completed' : 'Cancelled'}
		</span>
	</span>
</span>
