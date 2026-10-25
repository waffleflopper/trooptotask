<script lang="ts">
	import type { PublishedWhatsNewEntry } from '$features/platform-admin/contracts';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatDisplayDate } from '$lib/utils/dates';

	let {
		entries,
		allEntriesHref,
		onClose
	}: { entries: PublishedWhatsNewEntry[]; allEntriesHref: string; onClose: () => void } = $props();

	const latest = $derived(entries[0]);
	const older = $derived(entries.slice(1));
</script>

<AppDialog.Root {onClose}>
	<AppDialog.Content class="sm:max-w-2xl">
		<AppDialog.Header class="border-border border-b px-6 pt-5 pb-4">
			<div class="flex items-start justify-between gap-6 pr-10">
				<div class="min-w-0">
					<AppDialog.Title
						class="[font-family:'Barlow Condensed',sans-serif] text-2xl leading-none font-bold tracking-[0.02em]"
					>
						What's New
					</AppDialog.Title>
				</div>
				{#if latest}
					<span
						class="bg-muted text-muted-foreground border-border hidden shrink-0 rounded-full border px-3 py-1 font-mono text-[0.6875rem] font-medium tracking-[0.08em] whitespace-nowrap uppercase sm:inline-flex"
					>
						{formatDisplayDate(latest.publishedOn)}
					</span>
				{/if}
			</div>
		</AppDialog.Header>

		<AppDialog.Body class="max-h-[min(34rem,calc(100dvh-12rem))] overscroll-contain px-6 py-5">
			{#if latest}
				<section class="bg-muted/35 border-border mb-5 rounded-md border p-4">
					<div class="mb-4 flex items-start justify-between gap-4">
						<div class="min-w-0">
							<p
								class="text-primary mb-2 font-mono text-[0.6875rem] leading-none font-semibold tracking-[0.08em] uppercase"
							>
								Latest update
							</p>
							<h3
								class="text-foreground m-0 [font-family:'Barlow Condensed',sans-serif] text-xl leading-tight font-bold tracking-[0.02em]"
							>
								{latest.title}
							</h3>
						</div>
						<span class="text-muted-foreground mt-0.5 font-mono text-[0.75rem] whitespace-nowrap sm:hidden">
							{formatDisplayDate(latest.publishedOn)}
						</span>
					</div>
					<div class="flex flex-col gap-2.5">
						{#each latest.paragraphs as paragraph, index (`${latest.id}:${index}`)}
							<p class="text-foreground/85 m-0 text-sm leading-6">{paragraph}</p>
						{/each}
					</div>
				</section>
			{:else}
				<p class="text-muted-foreground m-0 py-6 text-center text-sm">Nothing new to show yet.</p>
			{/if}

			{#if older.length > 0}
				<section class="flex flex-col gap-3" aria-label="Earlier updates">
					<div class="flex items-center gap-4 py-1">
						<div class="bg-border h-px flex-1"></div>
						<span
							class="text-muted-foreground font-mono text-[0.6875rem] font-medium tracking-[0.08em] whitespace-nowrap uppercase"
						>
							Earlier Updates
						</span>
						<div class="bg-border h-px flex-1"></div>
					</div>
					{#each older as entry (entry.id)}
						<article class="border-border border-b py-3 last:border-b-0">
							<div class="mb-2 flex items-baseline justify-between gap-3">
								<h4
									class="text-foreground m-0 [font-family:'Barlow Condensed',sans-serif] text-base leading-tight font-semibold tracking-[0.02em]"
								>
									{entry.title}
								</h4>
								<span class="text-muted-foreground font-mono text-xs whitespace-nowrap"
									>{formatDisplayDate(entry.publishedOn)}</span
								>
							</div>
							<div class="flex flex-col gap-1.5">
								{#each entry.paragraphs as paragraph, index (`${entry.id}:${index}`)}
									<p class="text-muted-foreground m-0 text-xs leading-5">{paragraph}</p>
								{/each}
							</div>
						</article>
					{/each}
				</section>
			{/if}
		</AppDialog.Body>

		<AppDialog.Footer class="border-border bg-popover border-t px-6 py-4">
			<Button variant="ghost" href={allEntriesHref} onclick={onClose}>See all updates</Button>
			<Button onclick={onClose}>Got it</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
