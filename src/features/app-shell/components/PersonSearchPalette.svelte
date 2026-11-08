<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { matchesPersonSearch, type PersonSearchEntry } from '$features/personnel/contracts';
	import { personnelRecordHref } from '$features/personnel/personnelRecordHref';
	import { closePersonSearch, openPersonSearch, togglePersonSearch } from '../personSearchNavigation';

	interface Props {
		orgId: string;
		orgUrlSegment: string;
	}

	let { orgId, orgUrlSegment }: Props = $props();

	const MAX_RESULTS = 20;

	let query = $state('');
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let retryCount = $state(0);
	let recordHref = $state<string | null>(null);
	// One index per Organization, kept while the shell is mounted and refreshed in the background on every open.
	let index = $state<{ orgId: string; people: PersonSearchEntry[] } | null>(null);

	const open = $derived(page.state.personSearch === true);
	const people = $derived(index?.orgId === orgId ? index.people : []);
	const matches = $derived(people.filter((person) => matchesPersonSearch(person, query)));
	const shown = $derived(matches.slice(0, MAX_RESULTS));
	const showSkeleton = $derived(status === 'loading' && people.length === 0);
	const showError = $derived(status === 'error' && people.length === 0);
	const statusMessage = $derived.by(() => {
		if (showSkeleton) return 'Loading people';
		if (showError) return '';
		if (matches.length === 0) return 'No people found.';
		return `${matches.length} ${matches.length === 1 ? 'person' : 'people'} found.`;
	});

	// A response is used only while this effect run is current: closing the palette or switching Organization aborts it.
	$effect(() => {
		if (!open) return;
		void retryCount;
		const controller = new AbortController();
		status = 'loading';
		void loadIndex(orgId, orgUrlSegment, controller.signal);
		return () => controller.abort();
	});

	$effect(() => {
		if (page.state.personSearch !== true) {
			query = '';
			if (recordHref) {
				const href = recordHref;
				recordHref = null;
				void goto(href);
			}
		}
	});

	async function loadIndex(forOrgId: string, segment: string, signal: AbortSignal) {
		try {
			const response = await fetch(`/org/${segment}/api/personnel`, { signal });
			if (!response.ok) throw new Error('Could not load people');
			const body = await response.json();
			if (signal.aborted) return;
			if (!Array.isArray(body?.people)) throw new Error('Could not load people');
			index = { orgId: forOrgId, people: body.people };
			status = 'ready';
		} catch {
			if (signal.aborted) return;
			status = 'error';
		}
	}

	function select(person: PersonSearchEntry) {
		recordHref = personnelRecordHref(orgUrlSegment, person);
		closePersonSearch();
	}

	let shortcut = $state('⌘K');
	$effect(() => {
		if (!/Mac|iPhone|iPad/.test(navigator.userAgent)) shortcut = 'Ctrl K';
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
		if (event.repeat || event.isComposing) return;
		event.preventDefault();
		togglePersonSearch();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<Command.Dialog
	bind:open={() => open, (next) => (next ? openPersonSearch() : closePersonSearch())}
	title="Find a person"
	description="Search people by rank and name, then open their record."
	shouldFilter={false}
	class="sm:max-w-lg"
>
	<Command.Input placeholder="Find a person by rank or name" bind:value={query} aria-keyshortcuts="Meta+K Control+K">
		{#snippet end()}
			<kbd
				class="min-w-[6ch] rounded-sm border border-border px-1 text-center font-mono text-[11px] leading-4"
				aria-hidden="true">{shortcut}</kbd
			>
		{/snippet}
	</Command.Input>
	<p role="status" class="sr-only">{statusMessage}</p>
	<Command.List class="max-h-72 min-h-40 p-1" aria-busy={showSkeleton}>
		{#if showSkeleton}
			<div class="grid gap-2 p-1" aria-hidden="true" data-testid="person-search-loading">
				{#each [0, 1, 2, 3] as row (row)}
					<Skeleton class="h-7 w-full" />
				{/each}
			</div>
		{:else if showError}
			<div class="grid justify-items-center gap-2 px-2 py-6 text-center text-sm" role="alert">
				<span>People could not be loaded.</span>
				<Button variant="outline" size="sm" onclick={() => retryCount++}>Try again</Button>
			</div>
		{:else}
			{#each shown as person (person.id)}
				<Command.Item value="person:{person.id}" onSelect={() => select(person)}>
					<span class="min-w-0 flex-1 truncate font-medium">{person.rank} {person.lastName}, {person.firstName}</span>
					{#if person.groupName}
						<span class="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">{person.groupName}</span>
					{/if}
				</Command.Item>
			{/each}
			{#if matches.length === 0}
				<Command.Empty aria-hidden="true">No people found.</Command.Empty>
			{:else if matches.length > MAX_RESULTS}
				<p class="px-2 py-2 text-center text-xs text-muted-foreground">
					Showing the first {MAX_RESULTS} of {matches.length}. Keep typing to narrow the list.
				</p>
			{/if}
		{/if}
	</Command.List>
</Command.Dialog>
