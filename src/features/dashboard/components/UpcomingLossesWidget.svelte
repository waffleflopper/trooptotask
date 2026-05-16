<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import type { BadgeVariant } from '$lib/components/ui/badge/badge.svelte';
	import type { UpcomingLossRecord } from '$lib/domain/readinessSignals';

	interface Props {
		losses: UpcomingLossRecord[];
		formatDate: (dateStr: string) => string;
	}

	let { losses, formatDate }: Props = $props();

	function urgencyTier(days: number): 'critical' | 'warning' | 'routine' {
		if (days <= 30) return 'critical';
		if (days <= 90) return 'warning';
		return 'routine';
	}

	function urgencyVariant(days: number): BadgeVariant {
		const tier = urgencyTier(days);
		if (tier === 'critical') return 'danger';
		if (tier === 'warning') return 'warning';
		return 'outline';
	}

	function formatDaysRemaining(days: number): string {
		if (days === 0) return 'Today';
		if (days === 1) return '1 day';
		return `${days} days`;
	}
</script>

<div class="flex flex-col">
	<div class="mb-3 flex items-center gap-3">
		<span class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase"
			>Upcoming Losses</span
		>
		{#if losses.length > 0}
			<Badge variant="secondary">{losses.length}</Badge>
		{/if}
	</div>

	{#if losses.length === 0}
		<p class="py-4 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
			No personnel approaching ETS or PCS / DEROS window.
		</p>
	{:else}
		<div class="flex flex-col" role="list">
			{#each losses as entry (entry.id)}
				<div
					class="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-3 border-t border-border/60 py-2 first:border-t-0"
					role="listitem"
				>
					<div class="flex min-w-0 items-baseline gap-1">
						<span class="shrink-0 font-mono text-xs text-muted-foreground uppercase">{entry.rank}</span>
						<span class="truncate text-sm text-foreground">{entry.lastName}</span>
					</div>

					<Badge variant="secondary">{entry.triggerType}</Badge>

					<span class="shrink-0 font-mono text-xs tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase">
						{formatDate(entry.targetDate)}
					</span>

					<Badge variant={urgencyVariant(entry.daysRemaining)} title="{entry.daysRemaining} calendar days remaining">
						{formatDaysRemaining(entry.daysRemaining)}
					</Badge>
				</div>
			{/each}
		</div>
	{/if}
</div>
