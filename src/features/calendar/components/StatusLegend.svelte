<script lang="ts">
	import type { StatusType } from '$lib/types';

	interface Props {
		statusTypes: StatusType[];
	}

	let { statusTypes }: Props = $props();
</script>

<div
	class="flex flex-wrap items-start gap-x-4 gap-y-3 rounded-lg border bg-card px-4 py-3"
	role="region"
	aria-label="Status color legend"
>
	<span class="pt-0.5 font-mono text-xs font-semibold tracking-widest whitespace-nowrap text-muted-foreground uppercase"
		>Status Key:</span
	>
	<div class="flex flex-wrap gap-x-3 gap-y-2">
		{#each statusTypes as status (status.id)}
			<div class="flex min-h-6 items-center gap-2">
				<span
					class="size-3 shrink-0 rounded-[2px] shadow-[inset_0_0_0_1px_rgba(14,14,13,0.12)]"
					style="background-color: {status.color}"
					aria-hidden="true"
				></span>
				<span class="font-mono text-xs font-medium tracking-wider text-foreground uppercase">{status.name}</span>
			</div>
		{/each}
	</div>
</div>
