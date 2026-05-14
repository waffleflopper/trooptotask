<script lang="ts">
	import { changelog } from '$lib/data/changelog';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { cn } from '$lib/utils';

	let { onClose }: { onClose: () => void } = $props();

	const latest = changelog[0];
	const older = changelog.slice(1, 10);
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
						{formatDisplayDate(latest.date)}
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
							{formatDisplayDate(latest.date)}
						</span>
					</div>
					<ul class="m-0 flex list-none flex-col gap-2.5 p-0">
						{#each latest.items as item, index (`${latest.id}:${index}`)}
							<li class="grid grid-cols-[0.625rem_1fr] gap-3 text-sm leading-6">
								<span class="bg-primary mt-2.5 h-1.5 w-1.5 rounded-full" aria-hidden="true"></span>
								<span class="text-foreground/85">{item}</span>
							</li>
						{/each}
					</ul>
				</section>
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
									>{formatDisplayDate(entry.date)}</span
								>
							</div>
							<ul class="m-0 flex list-none flex-col gap-1 p-0">
								{#each entry.items as item, index (`${entry.id}:${index}`)}
									<li class={cn('grid grid-cols-[0.5rem_1fr] gap-2 text-xs leading-5', index > 1 && 'hidden sm:grid')}>
										<span class="bg-muted-foreground/50 mt-2 h-1 w-1 rounded-full" aria-hidden="true"></span>
										<span class="text-muted-foreground">{item}</span>
									</li>
								{/each}
							</ul>
						</article>
					{/each}
				</section>
			{/if}
		</AppDialog.Body>

		<AppDialog.Footer class="border-border bg-popover border-t px-6 py-4">
			<Button onclick={onClose}>Got it</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
