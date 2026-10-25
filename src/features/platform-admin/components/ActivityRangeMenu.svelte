<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import * as ReportWorkspace from '$lib/components/patterns/report-workspace';
	import type { ActivityRangePreset } from '../activityQuery';

	let {
		label,
		presets,
		timeZone,
		start = $bindable(),
		end = $bindable()
	}: {
		label: string;
		presets: ActivityRangePreset[];
		timeZone: string;
		start: string;
		end: string;
	} = $props();
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="sm"
				class="font-mono text-xs tracking-[0.08em] uppercase"
				aria-label={`Date range: ${label}`}
			>
				{label}
				<ChevronDown aria-hidden="true" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="end" class="w-[28rem] max-w-(--bits-popover-content-available-width) gap-3 p-3">
		<ReportWorkspace.DateRangeField bind:start bind:end {presets} />
		<div class="flex items-center justify-between gap-2">
			<p class="text-xs text-muted-foreground">Days follow {timeZone.replace(/_/g, ' ')}.</p>
			<Button
				variant="ghost"
				size="sm"
				disabled={!start && !end}
				onclick={() => {
					start = '';
					end = '';
				}}
			>
				All time
			</Button>
		</div>
	</Popover.Content>
</Popover.Root>
