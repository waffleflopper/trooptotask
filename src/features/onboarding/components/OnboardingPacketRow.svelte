<script lang="ts">
	import type { DetailLine, PacketStatus, PacketSummary } from '../onboardingStatus';
	import { Button } from '$lib/components/ui/button';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	interface Props {
		summary: PacketSummary;
		name: string;
		meta: string;
		selected: boolean;
		onSelect: () => void;
	}

	let { summary, name, meta, selected, onSelect }: Props = $props();

	const STATUS_LABELS: Record<PacketStatus, string> = {
		stalled: 'Stalled',
		ready: 'Ready',
		on_track: 'On track',
		new: 'New'
	};

	function detailText(detail: DetailLine): string {
		switch (detail.kind) {
			case 'stage':
				return `${detail.stage} · ${detail.days === 1 ? '1 day' : `${detail.days} days`}`;
			case 'training':
				return 'Waiting on training record';
			case 'started_today':
				return 'Started today';
			case 'more_open':
				return `+ ${detail.count} more open`;
			case 'all_done':
				return 'Close out to finish';
			case 'none':
				return '';
		}
	}

	const detail = $derived(detailText(summary.detail));
	const detailStalled = $derived(summary.detail.kind === 'stage' && summary.detail.stalled);
</script>

<Button
	variant="ghost"
	size="none"
	aria-current={selected ? 'true' : undefined}
	data-onboarding-id={summary.packet.id}
	onclick={onSelect}
	class={[
		'w-full justify-start gap-3 rounded-none border-0 border-l-4 px-3 py-3 text-left font-normal whitespace-normal',
		summary.status === 'stalled'
			? 'border-l-warning'
			: summary.status === 'ready'
				? 'border-l-success'
				: 'border-l-border',
		selected && 'bg-muted'
	]}
>
	<span
		class={[
			'w-16 shrink-0 text-sm font-medium',
			summary.status === 'stalled' && 'text-warning-foreground',
			summary.status === 'ready' && 'text-success-foreground',
			(summary.status === 'on_track' || summary.status === 'new') && 'text-muted-foreground'
		]}
	>
		{STATUS_LABELS[summary.status]}
	</span>
	<span class="grid min-w-0 flex-1 gap-2 md:grid-cols-2 md:gap-4">
		<span class="grid min-w-0 gap-0.5">
			<span class="truncate font-semibold">{name}</span>
			<span class="truncate text-xs text-muted-foreground">{meta}</span>
		</span>
		<span class="grid min-w-0 gap-0.5">
			<span class="truncate">{summary.focus?.stepName ?? 'All steps done'}</span>
			{#if detail}
				<span
					class={['truncate font-mono text-xs', detailStalled ? 'text-warning-foreground' : 'text-muted-foreground']}
				>
					{detail}
				</span>
			{/if}
		</span>
	</span>
	<span class="hidden w-24 shrink-0 gap-1.5 sm:grid">
		<span class="text-right font-mono text-xs">{summary.done} of {summary.total}</span>
		<span aria-hidden="true" class="h-1 overflow-hidden rounded-full bg-muted">
			<span
				class={['block h-full', summary.status === 'ready' ? 'bg-success' : 'bg-foreground']}
				style:width={`${summary.total ? (100 * summary.done) / summary.total : 0}%`}
			></span>
		</span>
	</span>
	<span class="w-14 shrink-0 text-right font-mono text-xs">Day {summary.day}</span>
	<ChevronRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
</Button>
