<script lang="ts">
	import { SETTINGS_PAGES, type SettingsPageKey, type SettingsSkeletonBlock } from './settingsShell';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { cn } from '$lib/utils.js';

	/** The body of a settings page while it loads, shaped like the page so nothing moves when it arrives. */
	let { page }: { page: SettingsPageKey } = $props();
	const blocks = $derived<readonly SettingsSkeletonBlock[]>(SETTINGS_PAGES[page].skeleton);
</script>

<div class="grid" aria-hidden="true" data-settings-skeleton={page}>
	{#each blocks as block, index (index)}
		{@const opensSection = index > 0 && (block.kind === 'heading' || block.kind === 'strip')}
		{#if block.kind === 'rows'}
			<div
				class={cn(
					'border-t-2',
					block.rule === 'destructive' ? 'border-destructive' : 'border-foreground',
					block.endRule && 'border-b'
				)}
			>
				{#each block.heights as height, row (row)}
					<div class="flex items-center gap-4 border-b last:border-b-0" style:height="{height}px">
						<div class="grid flex-1 gap-2">
							<Skeleton class="h-5 w-40" />
							<Skeleton class="h-3.5 w-80 max-w-full" />
						</div>
						<Skeleton class="h-8 w-20 shrink-0" />
					</div>
				{/each}
			</div>
		{:else if block.kind === 'heading'}
			<div
				class={cn('flex items-end justify-between gap-4 border-b-2 border-foreground pb-3', opensSection && 'mt-10')}
			>
				<Skeleton class="h-6.5 w-44" />
				{#if block.action}<Skeleton class="h-8 w-55 max-w-1/2" />{/if}
			</div>
		{:else if block.kind === 'toolbar'}
			<div class="flex items-center gap-2" style:height="{block.height}px">
				<Skeleton class="h-8 w-64" />
				<Skeleton class="ml-auto h-8 w-60 max-w-1/3" />
			</div>
		{:else if block.kind === 'strip'}
			<div class={cn('grid gap-2.5 rounded-sm border bg-muted p-3.5', opensSection && 'mt-10')}>
				<Skeleton class="h-8 w-full bg-foreground/10" />
				<Skeleton class="h-5 w-2/3 bg-foreground/10" />
			</div>
		{:else}
			<div>
				{#if block.header}
					<div class="flex h-10 items-center gap-4 border-b">
						<Skeleton class="h-3 w-24" />
						<Skeleton class="h-3 w-16" />
					</div>
				{/if}
				{#each { length: block.rows } as _, row (row)}
					<div class="flex items-center gap-4 border-b" style:height="{block.height}px">
						<Skeleton class="h-4 w-48" />
						<Skeleton class="h-3.5 w-24" />
						<Skeleton class="ml-auto h-7 w-16" />
					</div>
				{/each}
			</div>
		{/if}
	{/each}
</div>
