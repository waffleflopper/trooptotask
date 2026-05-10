<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';

	interface Props {
		title: string;
		values: string[];
		selected: string[];
		onchange: (selected: string[]) => void;
		description?: string;
		searchPlaceholder?: string;
		emptyMessage?: string;
		noResultsMessage?: string;
		removeLabel?: (value: string) => string;
		tone?: 'default' | 'danger';
	}

	let {
		title,
		values,
		selected,
		onchange,
		description,
		searchPlaceholder = `Search ${title.toLowerCase()}`,
		emptyMessage = `No ${title.toLowerCase()} available.`,
		noResultsMessage = 'No matches.',
		removeLabel = (value: string) => `Remove ${value}`,
		tone = 'default'
	}: Props = $props();

	const uid = $props.id();
	let query = $state('');

	const normalizedQuery = $derived(query.trim().toLowerCase());
	const filteredValues = $derived(
		normalizedQuery.length === 0 ? values : values.filter((value) => value.toLowerCase().includes(normalizedQuery))
	);
	const selectedSet = $derived(new Set(selected));
	const selectedValues = $derived(selected);
	const selectedCountLabel = $derived(`${selected.length} selected`);

	function toggle(value: string) {
		onchange(selectedSet.has(value) ? selected.filter((item) => item !== value) : [...selected, value]);
	}

	function remove(value: string) {
		onchange(selected.filter((item) => item !== value));
	}
</script>

<section data-slot="type-management-workspace-group-selector" class="grid gap-3">
	<div data-slot="type-management-workspace-group-selector-header" class="flex items-start justify-between gap-3">
		<div class="grid gap-1">
			<h4 class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{title}</h4>
			{#if description}
				<p class="text-sm text-muted-foreground">{description}</p>
			{/if}
		</div>
		<Badge variant={selected.length > 0 ? (tone === 'danger' ? 'danger' : 'secondary') : 'outline'}>
			{selectedCountLabel}
		</Badge>
	</div>

	{#if values.length === 0}
		<p data-slot="type-management-workspace-group-selector-empty" class="text-sm text-muted-foreground">
			{emptyMessage}
		</p>
	{:else}
		<div data-slot="type-management-workspace-group-selector-search">
			<label class="sr-only" for="{uid}-search">{searchPlaceholder}</label>
			<Input id="{uid}-search" type="search" bind:value={query} placeholder={searchPlaceholder} />
		</div>

		{#if selectedValues.length > 0}
			<div data-slot="type-management-workspace-group-selector-selected" class="flex flex-wrap gap-2">
				{#each selectedValues as value (value)}
					<Badge variant={tone === 'danger' ? 'danger' : 'outline'}>
						{value}
						<button
							type="button"
							class="-my-2.5 -mr-2 ml-1 inline-flex size-10 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:-my-1 sm:size-7"
							aria-label={removeLabel(value)}
							onclick={() => remove(value)}
						>
							<X aria-hidden="true" class="size-3" />
						</button>
					</Badge>
				{/each}
			</div>
		{/if}

		<div
			data-slot="type-management-workspace-group-selector-options"
			class="grid max-h-56 overflow-auto rounded-md border"
		>
			{#each filteredValues as value, index (value)}
				<label
					for="{uid}-option-{index}"
					class="flex min-h-9 cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/50 has-[[data-slot=checkbox]:focus-visible]:bg-muted/50"
				>
					<Checkbox
						id="{uid}-option-{index}"
						checked={selectedSet.has(value)}
						onclick={() => toggle(value)}
						aria-label={value}
					/>
					<span>{value}</span>
				</label>
			{:else}
				<p class="px-3 py-4 text-sm text-muted-foreground">{noResultsMessage}</p>
			{/each}
		</div>

		{#if selected.length > 0}
			<div class="flex justify-end">
				<Button variant="ghost" size="sm" type="button" onclick={() => onchange([])}>Clear {title}</Button>
			</div>
		{/if}
	{/if}
</section>
