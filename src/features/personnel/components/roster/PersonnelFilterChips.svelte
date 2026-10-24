<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Toggle } from '$lib/components/ui/toggle';
	import { chipOf } from '../../rosterFilter';
	import type { RosterChip, RosterFilter, SummaryState } from '../../rosterSignals';

	interface Props {
		summary: SummaryState;
		/** Chips this viewer can expect, so a row that will never fill is not reserved while the lane loads. */
		expectedCount: number;
		filter: RosterFilter | null;
		onToggle: (chip: RosterChip) => void;
	}

	let { summary, expectedCount, filter, onToggle }: Props = $props();

	const CHIP_LABELS: Record<RosterChip, string> = {
		expired: 'Expired or missing',
		expiring: 'Expiring ≤ 30d',
		'follow-ups': 'Overdue follow-ups',
		'not-present': 'Not present',
		losses: 'ETS/PCS ≤ 90d',
		counseling: 'Counseling due'
	};
	const CHIP_DOTS: Partial<Record<RosterChip, string>> = {
		expired: 'bg-destructive-text',
		expiring: 'bg-accent',
		'follow-ups': 'bg-destructive',
		'not-present': 'bg-muted-foreground'
	};

	const chips = $derived(summary.kind === 'ready' ? summary.value.chips : []);
	const activeChip = $derived(chipOf(filter));
	const visible = $derived(summary.kind === 'pending' ? expectedCount > 0 : chips.length > 0);
</script>

{#if visible}
	<div class="flex min-w-0 items-center gap-2">
		<span class="shrink-0 pr-1 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Show only</span>
		<!-- Scrolls inside itself at narrow widths; the padding keeps each chip's focus ring from being clipped. -->
		<div
			class="-m-1 flex min-w-0 items-center gap-2 overflow-x-auto p-1"
			role="group"
			aria-label="Show only"
			aria-busy={summary.kind === 'pending'}
		>
			{#if summary.kind === 'pending'}
				{#each { length: expectedCount } as _, placeholder (placeholder)}
					<Skeleton class="h-7.5 w-32 shrink-0 rounded-full" />
				{/each}
			{:else}
				{#each chips as { chip, people } (chip)}
					{@const active = activeChip === chip}
					<Toggle
						variant="chip"
						size="chip"
						class={['shrink-0', people === 0 && !active && 'text-muted-foreground']}
						disabled={people === 0 && !active}
						bind:pressed={() => active, () => onToggle(chip)}
					>
						{#if CHIP_DOTS[chip]}
							<span class="size-1.75 shrink-0 rounded-full {CHIP_DOTS[chip]}" aria-hidden="true"></span>
						{/if}
						{CHIP_LABELS[chip]}
						<span class={['font-mono text-xs tabular-nums', active ? 'text-background/75' : 'text-muted-foreground']}
							>{people}</span
						>
						{#if active}
							<XIcon class="size-2.75" aria-hidden="true" />
						{/if}
					</Toggle>
				{/each}
			{/if}
		</div>
	</div>
{/if}
