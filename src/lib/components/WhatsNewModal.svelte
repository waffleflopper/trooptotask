<script lang="ts">
	import { changelog } from '$lib/data/changelog';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatDisplayDate } from '$lib/utils/dates';

	let { onClose }: { onClose: () => void } = $props();

	const latest = changelog[0];
	const older = changelog.slice(1, 10);
</script>

<AppDialog.Root {onClose}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>What's New</AppDialog.Title>
			<AppDialog.Description>Recent product updates and improvements.</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body class="max-h-[min(26rem,calc(100dvh-12rem))] overscroll-contain">
			{#if latest}
				<div class="mb-4">
					<div class="mb-2 flex items-baseline justify-between gap-2">
						<h3 class="text-foreground m-0 text-base font-semibold">{latest.title}</h3>
						<span class="text-muted-foreground font-mono text-xs whitespace-nowrap"
							>{formatDisplayDate(latest.date)}</span
						>
					</div>
					<ul class="m-0 ml-4 flex list-disc flex-col gap-1 p-0 marker:text-primary">
						{#each latest.items as item, index (`${latest.id}:${index}`)}
							<li class="text-muted-foreground pl-1 text-sm leading-6">
								{item}
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if older.length > 0}
				<div class="flex flex-col gap-4">
					<div class="flex items-center gap-4 py-2">
						<div class="bg-border h-px flex-1"></div>
						<span
							class="text-muted-foreground font-mono text-xs font-medium tracking-[0.06em] whitespace-nowrap uppercase"
						>
							Earlier Updates
						</span>
						<div class="bg-border h-px flex-1"></div>
					</div>
					{#each older as entry (entry.id)}
						<div class="py-2">
							<div class="mb-2 flex items-baseline justify-between gap-2">
								<h4 class="text-foreground m-0 text-sm font-semibold">{entry.title}</h4>
								<span class="text-muted-foreground font-mono text-xs whitespace-nowrap"
									>{formatDisplayDate(entry.date)}</span
								>
							</div>
							<ul class="m-0 ml-4 flex list-disc flex-col gap-1 p-0 marker:text-primary">
								{#each entry.items as item, index (`${entry.id}:${index}`)}
									<li class="text-muted-foreground pl-1 text-xs leading-5">
										{item}
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			{/if}
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button onclick={onClose}>Got it</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
