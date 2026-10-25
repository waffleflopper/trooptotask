<script lang="ts">
	import { cn } from '$lib/utils';
	import type { TimelineEntry } from '../../setupTimeline';
	import { createClientClock } from './clientClock.svelte';

	interface Props {
		entries: TimelineEntry[];
		label: string;
		/** Shown when nothing has happened yet. */
		empty?: string;
	}

	let { entries, label, empty }: Props = $props();

	const clock = createClientClock();
	const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
	const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
</script>

{#if entries.length === 0 && empty}
	<p class="border-t border-foreground py-3 text-sm text-muted-foreground">{empty}</p>
{:else}
	<ol aria-label={label} class="border-t border-foreground">
		{#each entries as entry (entry.id)}
			<li
				class="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 border-b border-border py-2.5 sm:grid-cols-[1rem_minmax(0,1fr)_auto]"
			>
				<span
					aria-hidden="true"
					class={cn(
						'mt-2 size-2.5 rounded-full border-[1.5px]',
						entry.tone === 'pending' ? 'border-muted-foreground bg-transparent' : 'border-foreground bg-foreground',
						entry.tone === 'failed' && 'border-danger bg-danger'
					)}
				></span>
				<div class="grid min-w-0 gap-0.5">
					<p
						class={cn(
							'text-[15px] leading-6 wrap-anywhere',
							entry.tone === 'failed' && 'text-danger-foreground',
							entry.tone === 'pending' && 'text-muted-foreground'
						)}
					>
						{entry.text}
					</p>
					{#if entry.detail}
						<p class="text-[13px] leading-5 wrap-anywhere text-muted-foreground">{entry.detail}</p>
					{/if}
				</div>
				<time
					datetime={entry.at}
					class="col-start-2 font-mono text-[11px] leading-6 tracking-[0.06em] text-muted-foreground uppercase sm:col-start-3"
				>
					{#if clock.now}
						{date.format(new Date(entry.at))}{entry.tone === 'pending' ? '' : ` · ${time.format(new Date(entry.at))}`}
					{:else}
						<span class="invisible">00 Oct · 00:00</span>
					{/if}
				</time>
			</li>
		{/each}
	</ol>
{/if}
