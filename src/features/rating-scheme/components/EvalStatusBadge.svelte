<script lang="ts">
	import { SegmentedProgress } from '$lib/components/ui/progress';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { formatDayMonthShortYear } from '$lib/utils/dates';
	import { cn } from '$lib/utils';
	import type { EvalStatusBadgeView } from '../utils/evalStatusBadge';
	import { ratingDueTone } from '../utils/ratingDueTone';

	interface Props {
		badge: EvalStatusBadgeView;
		/** Rendered as a link when given; the badge never moves a step. */
		href?: string;
		/** Names the Rated Soldier for a link, so it reads on its own. */
		linkLabel?: string;
		class?: string;
	}

	let { badge, href, linkLabel, class: className }: Props = $props();

	const chipClass =
		'inline-flex max-w-full items-center gap-[7px] rounded-sm border bg-background py-1 pr-[9px] pl-2 text-[13px] leading-4 whitespace-nowrap text-foreground';
</script>

{#snippet content()}
	<SegmentedProgress
		size="chip"
		value={badge.step}
		max={badge.stepCount}
		aria-label="Evaluation step {badge.step} of {badge.stepCount}"
	/>
	<span class="truncate">{badge.label}</span>
	{#if badge.thru}
		<span class={cn('font-mono text-xs font-semibold', ratingDueTone[badge.thru.status].text)}>{badge.thru.text}</span>
	{/if}
{/snippet}

{#if href}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<a
					{...props}
					{href}
					data-slot="eval-status-badge"
					aria-label={linkLabel}
					class={cn(
						chipClass,
						'transition-colors outline-none hover:border-foreground focus-visible:border-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
						className
					)}
				>
					{@render content()}
				</a>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>
			{badge.title} · {formatDayMonthShortYear(badge.ratingPeriodStart)} → {formatDayMonthShortYear(
				badge.ratingPeriodEnd
			)}. Open in Eval Tracker.
		</Tooltip.Content>
	</Tooltip.Root>
{:else}
	<span data-slot="eval-status-badge" class={cn(chipClass, className)}>
		{@render content()}
	</span>
{/if}
