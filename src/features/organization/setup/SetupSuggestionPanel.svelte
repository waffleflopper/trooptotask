<script lang="ts" generics="T extends { id: string; name: string }">
	import type { Snippet } from 'svelte';
	import type { SvelteSet } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import SetupFeaturePanel from './SetupFeaturePanel.svelte';

	/** Rows shown at phone width before "Show N more". */
	const NARROW_ROWS = 3;

	let {
		title,
		suggestions,
		unpicked,
		added = () => false,
		loading,
		loadingLabel,
		placeholderRows = 0,
		detail,
		notice,
		children
	}: {
		title: string;
		suggestions: readonly T[];
		/**
		 * Unchecked rather than checked picks, so suggestions that arrive later, as after turning a feature back on, start
		 * checked.
		 */
		unpicked: SvelteSet<string>;
		/** A suggestion already saved, shown checked and locked. */
		added?: (suggestion: T) => boolean;
		/** The saved rows are still loading, so the count is unknown. */
		loading: boolean;
		loadingLabel: string;
		/** Skeleton rows to hold while loading, when which suggestions show depends on the saved rows. */
		placeholderRows?: number;
		/** The row's trailing detail. */
		detail: Snippet<[T, boolean]>;
		/** Shown above the rows, as a load error. */
		notice?: Snippet;
		children: Snippet;
	} = $props();

	let expanded = $state(false);

	const open = $derived(suggestions.filter((suggestion) => !added(suggestion)));
	const picked = $derived(open.filter((suggestion) => !unpicked.has(suggestion.id)).length);
	const count = $derived(loading && placeholderRows > 0 ? placeholderRows : suggestions.length);
	const rows = $derived(Math.ceil(count / 2));
</script>

<SetupFeaturePanel {title}>
	{#snippet aside()}
		<span
			class="hidden font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase sm:inline"
			aria-live="polite"
		>
			{#if loading}
				<Skeleton class="inline-block h-3.5 w-28 align-middle" aria-hidden="true" />
				<span class="sr-only">{loadingLabel}</span>
			{:else if open.length === 0}
				All added
			{:else}
				{picked} of {open.length} selected
			{/if}
		</span>
	{/snippet}
	{@render notice?.()}
	<div class="@container/picks">
		<ul
			class="grid gap-x-8 @md/picks:grid-flow-col @md/picks:grid-cols-2"
			style:grid-template-rows="repeat({rows}, auto)"
		>
			{#if loading && placeholderRows > 0}
				{#each { length: placeholderRows }, index (index)}
					<li class={index >= NARROW_ROWS && !expanded ? 'max-sm:hidden' : undefined}>
						<div class="flex h-10 items-center gap-2.5 border-b border-border">
							<Skeleton class="size-4" />
							<Skeleton class="h-4 w-32" />
						</div>
					</li>
				{/each}
			{:else}
				{#each suggestions as suggestion, index (suggestion.id)}
					{@const exists = added(suggestion)}
					{@const checked = exists || !unpicked.has(suggestion.id)}
					<li class={index >= NARROW_ROWS && !expanded ? 'max-sm:hidden' : undefined}>
						<label
							class="flex h-10 cursor-pointer items-center gap-2.5 border-b border-border has-disabled:cursor-default"
						>
							<Checkbox
								{checked}
								disabled={exists}
								onCheckedChange={(next) => (next ? unpicked.delete(suggestion.id) : unpicked.add(suggestion.id))}
							/>
							<span class="min-w-0 flex-1 truncate text-sm leading-5 {checked ? '' : 'text-muted-foreground'}">
								{suggestion.name}
							</span>
							{@render detail(suggestion, exists)}
						</label>
					</li>
				{/each}
			{/if}
		</ul>
	</div>
	{#if !expanded && count > NARROW_ROWS}
		<Button
			variant="link"
			class="h-auto self-start p-0 text-foreground underline sm:hidden"
			disabled={loading && placeholderRows > 0}
			onclick={() => (expanded = true)}
		>
			Show {count - NARROW_ROWS} more
		</Button>
	{/if}
	{@render children()}
</SetupFeaturePanel>
