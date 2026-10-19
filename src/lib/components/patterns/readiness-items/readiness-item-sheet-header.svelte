<script lang="ts">
	import type { ReadinessItemStatus } from '$lib/domain/readinessItem';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { cn } from '$lib/utils.js';
	import { readinessItemStatusVisuals } from './readiness-item-table.svelte';

	let {
		eyebrow,
		title,
		status,
		standing
	}: {
		eyebrow: string;
		title: string;
		/** Absent while the viewer is still choosing the item. */
		status?: ReadinessItemStatus;
		standing?: string;
	} = $props();

	const dot: Record<ReadinessItemStatus, string> = {
		expired: 'bg-destructive',
		missing: 'bg-destructive',
		expiring: 'bg-warning',
		current: 'bg-success'
	};
</script>

<AppDialog.Header class="border-b pb-4">
	<p class="font-mono text-[0.6875rem] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
		{eyebrow}
	</p>
	<AppDialog.Title>{title}</AppDialog.Title>
	{#if status && standing}
		<AppDialog.Description class={cn('flex items-center gap-2 font-medium', readinessItemStatusVisuals[status].text)}>
			<span class={cn('size-2 shrink-0 rounded-full', dot[status])} aria-hidden="true"></span>
			{standing}
		</AppDialog.Description>
	{/if}
</AppDialog.Header>
