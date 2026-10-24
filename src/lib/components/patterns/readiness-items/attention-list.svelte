<script lang="ts" module>
	import type { ReadinessProblemStatus } from '$lib/domain/readinessItem';
	import { readinessItemStatusVisuals } from './readiness-item-table.svelte';

	export type AttentionListStatus = ReadinessProblemStatus | 'due' | 'upcoming';

	export interface AttentionListRow {
		id: string;
		status: AttentionListStatus;
		title: string;
		detail: string;
		category: string;
		timing: string;
		href: string;
	}

	const STATUS_VISUALS: Record<AttentionListStatus, { label: string; rule: string; text: string }> = {
		...readinessItemStatusVisuals,
		due: { label: 'Due', rule: 'border-l-warning', text: 'text-warning-foreground' },
		upcoming: { label: 'Upcoming', rule: 'border-l-muted-foreground', text: 'text-muted-foreground' }
	};
</script>

<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { cn } from '$lib/utils.js';

	/** `compact` draws each row on one line, title then state and timing, for a narrow side panel. */
	let { rows, label, compact = false }: { rows: AttentionListRow[]; label: string; compact?: boolean } = $props();
</script>

{#if compact}
	<ul class="flex flex-col gap-2" aria-label={label}>
		{#each rows as row (row.id)}
			{@const visual = STATUS_VISUALS[row.status]}
			<li>
				<a
					href={row.href}
					class={cn(
						'flex items-center gap-2.5 border-l-[3px] py-2 pr-1 pl-2.5 text-foreground hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none',
						visual.rule
					)}
				>
					<span class="min-w-0 flex-1 truncate text-sm leading-[18px] font-semibold">{row.title}</span>
					<span
						class={cn('shrink-0 font-mono text-xs', row.status === 'upcoming' ? 'text-muted-foreground' : visual.text)}
					>
						{visual.label} · {row.timing}
					</span>
				</a>
			</li>
		{/each}
	</ul>
{:else}
	<ul class="overflow-clip rounded-[4px] border" aria-label={label}>
		{#each rows as row (row.id)}
			{@const visual = STATUS_VISUALS[row.status]}
			<li class="border-b last:border-b-0">
				<a
					href={row.href}
					class={cn(
						'grid grid-cols-[minmax(0,1fr)_auto] text-foreground items-center gap-x-4 gap-y-1 border-l-[3px] px-3.5 py-3 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none sm:grid-cols-[84px_minmax(0,1fr)_112px_96px_16px]',
						visual.rule
					)}
				>
					<span class="order-3 col-span-2 flex min-w-0 flex-col gap-0.5 sm:order-2 sm:col-span-1">
						<span class="text-[15px] leading-5 font-semibold">{row.title}</span>
						<span class="text-[13px] leading-[18px] text-muted-foreground">{row.detail}</span>
					</span>
					<span class={cn('order-1 text-sm font-semibold', visual.text)}>{visual.label}</span>
					<span
						class={cn(
							'order-2 font-mono text-xs first-letter:uppercase max-sm:text-right sm:order-4',
							row.status === 'upcoming' ? 'text-muted-foreground' : visual.text
						)}
					>
						{row.timing}
					</span>
					<span
						class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase max-sm:hidden sm:order-3"
					>
						{row.category}
					</span>
					<ChevronRightIcon class="size-4 text-muted-foreground max-sm:hidden sm:order-5" aria-hidden="true" />
				</a>
			</li>
		{/each}
	</ul>
{/if}
