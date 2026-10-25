<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { IdentityPeoplePage, PeopleFilter } from '$features/identity/contracts';
	import AdminPageHeader from '$features/platform-admin/components/AdminPageHeader.svelte';
	import AdminPager from '$features/platform-admin/components/AdminPager.svelte';
	import { createAdminUrlSearch } from '$features/platform-admin/components/adminUrlSearch.svelte';
	import { createClientClock } from '$features/platform-admin/components/people/clientClock.svelte';
	import { settleRead } from '$features/platform-admin/components/inbox/settle.svelte';
	import type { PersonRegion } from '$features/platform-admin/contracts';
	import {
		formatSignIn,
		organizationsLabel,
		PERSON_STATE_VIEW,
		personHref
	} from '$features/platform-admin/peopleFormat';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter';
	import { WorkspaceToolbar } from '$lib/components/patterns/workspace-toolbar';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';

	let { data } = $props();

	const FILTERS: ReadonlyArray<{ value: PeopleFilter; label: string }> = [
		{ value: 'all', label: 'All' },
		{ value: 'notSetUp', label: 'Not set up' },
		{ value: 'suspended', label: 'Suspended' }
	];
	const COLUMNS = 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_9rem_8rem]';

	const clock = createClientClock();
	const unavailable: PersonRegion<IdentityPeoplePage> = { status: 'error', message: 'Unable to load People' };
	const region = settleRead(() => ({
		source: data.people,
		group: `${data.filter}|${data.search}|${data.page}`,
		promise: data.people.catch(() => unavailable)
	}));
	const group = $derived(`${data.filter}|${data.search}|${data.page}`);
	// A different filter, search or page never shows another one's rows.
	const settled = $derived(region.settled?.group === group ? region.settled.value : null);
	const result = $derived(settled?.status === 'ok' ? settled.data : null);

	function href(next: { search: string; filter: PeopleFilter; page: number }): string {
		const params = new SvelteURLSearchParams();
		if (next.search) params.set('search', next.search);
		if (next.filter !== 'all') params.set('filter', next.filter);
		if (next.page > 1) params.set('page', String(next.page));
		const query = params.toString();
		return query ? `/admin/people?${query}` : '/admin/people';
	}

	function show(next: Partial<{ search: string; filter: PeopleFilter; page: number }>, replaceState = false) {
		const target = href({ search: data.search, filter: data.filter, page: 1, ...next });
		return goto(resolve(target as '/admin/people'), { keepFocus: true, noScroll: true, replaceState });
	}

	const search = createAdminUrlSearch(
		() => data.search,
		(value) => void show({ search: value.trim() }, true)
	);

	const eyebrow = $derived.by(() => {
		if (!result) return 'Platform';
		const noun = { all: 'people', notSetUp: 'not set up', suspended: 'suspended' }[data.filter];
		const count = result.totalCount;
		const label = data.filter === 'all' && count === 1 ? 'person' : noun;
		return `Platform · ${count} ${data.search ? 'matching' : label}`;
	});

	const totalPages = $derived(result ? Math.max(1, Math.ceil(result.totalCount / result.limit)) : 1);
	const shownFrom = $derived(result && result.people.length > 0 ? (result.page - 1) * result.limit + 1 : 0);
	const shownTo = $derived(result ? shownFrom + result.people.length - (result.people.length > 0 ? 1 : 0) : 0);
	const filtered = $derived(data.filter !== 'all' || data.search !== '');
	const emptyTitle = $derived(
		data.search
			? `No one matches “${data.search}”.`
			: data.filter === 'notSetUp'
				? 'Nobody is waiting to finish setup.'
				: data.filter === 'suspended'
					? 'No accounts are suspended.'
					: 'No one has an account yet.'
	);
</script>

<svelte:head>
	<title>People - Platform Admin</title>
</svelte:head>

<div class="grid gap-6 px-4 pt-5 pb-10 sm:px-10 sm:pt-9">
	<AdminPageHeader
		{eyebrow}
		title="People"
		description="Everyone with an account, plus approved people who have not finished setup."
	/>

	<div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
		<div class="w-full min-w-0 sm:w-80">
			<WorkspaceToolbar
				ariaLabel="People controls"
				bare
				items={[]}
				search={{
					label: 'Search by name or email',
					placeholder: 'Search by name or email',
					value: search.value,
					onValueChange: search.setValue
				}}
			/>
		</div>
		<SegmentedFilter.Root
			label="Filter people"
			options={FILTERS}
			bind:value={() => data.filter, (next) => void show({ filter: next })}
		/>
	</div>

	<section aria-label="People" aria-busy={settled === null} class="grid min-w-0">
		<div
			aria-hidden="true"
			class={['hidden items-center gap-x-4 border-t border-b border-foreground px-3 py-2 lg:grid', COLUMNS]}
		>
			{#each ['Person', 'Organizations', 'Last sign-in', 'Status'] as heading (heading)}
				<span class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">{heading}</span>
			{/each}
		</div>

		{#if settled === null}
			<div role="status" aria-label="Loading people" class="max-lg:border-t max-lg:border-foreground">
				{#each [0, 1, 2, 3, 4, 5, 6, 7] as row (row)}
					<div
						class={[
							'grid gap-x-4 gap-y-2 border-b border-border px-3 py-3.5 max-lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center',
							COLUMNS
						]}
					>
						<div class="grid gap-1.5 max-lg:col-span-1">
							<Skeleton class="h-5 w-44 max-w-full" />
							<Skeleton class="h-4 w-56 max-w-full" />
						</div>
						<Skeleton class="h-5 w-28 max-lg:col-span-2 max-lg:row-start-2" />
						<Skeleton class="h-5 w-20 max-lg:col-span-2 max-lg:row-start-3" />
						<Skeleton class="h-5 w-16 max-lg:col-start-2 max-lg:row-start-1" />
					</div>
				{/each}
			</div>
		{:else if settled.status === 'error'}
			<Alert.Root variant="destructive">
				<Alert.Title>Unable to load People</Alert.Title>
				<Alert.Description>The list could not be loaded. Your search and filter are unchanged.</Alert.Description>
				<div class="mt-3">
					<Button variant="outline" onclick={() => void invalidate('admin:people')}>Retry People</Button>
				</div>
			</Alert.Root>
		{:else if settled.data.people.length === 0}
			<Empty.Root>
				<Empty.Header>
					<Empty.Title>{emptyTitle}</Empty.Title>
				</Empty.Header>
				{#if filtered}
					<Empty.Content>
						<Button variant="outline" onclick={() => void show({ search: '', filter: 'all' })}
							>Clear search and filter</Button
						>
					</Empty.Content>
				{/if}
			</Empty.Root>
		{:else}
			<ul class="max-lg:border-t max-lg:border-foreground">
				{#each settled.data.people as person (person.id)}
					{@const view = PERSON_STATE_VIEW[person.state.kind]}
					<li
						class={[
							'grid items-center gap-x-4 gap-y-1.5 border-b border-border px-3 py-3 max-lg:grid-cols-[minmax(0,1fr)_auto] lg:py-3.5',
							COLUMNS
						]}
					>
						<div class="grid min-w-0">
							<a
								href={resolve(personHref(person.state) as '/admin/people')}
								class="w-fit max-w-full truncate text-base font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
							>
								{person.name}
							</a>
							<span class="truncate font-mono text-xs text-muted-foreground">{person.email ?? 'No email on file'}</span>
						</div>
						<span class="min-w-0 truncate text-sm max-lg:col-span-2 max-lg:row-start-2">
							<span class="mr-2 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase lg:sr-only">
								Organizations
							</span>
							{organizationsLabel(person.organizationCount, person.state)}
						</span>
						<span class="text-sm max-lg:col-span-2 max-lg:row-start-3">
							<span class="mr-2 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase lg:sr-only">
								Last sign-in
							</span>
							{#if clock.now}
								{formatSignIn(person.lastSignInAt, clock.now)}
							{:else}
								<span class="invisible">00 min ago</span>
							{/if}
						</span>
						<span class="max-lg:col-start-2 max-lg:row-start-1">
							<span class="sr-only">Status: </span>
							<Badge variant={view.variant} class="font-mono text-[11px] tracking-[0.08em] uppercase">
								{view.label}
							</Badge>
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if result && result.people.length > 0}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
				Showing {shownFrom}–{shownTo} of {result.totalCount}
			</p>
			<AdminPager
				page={result.page}
				{totalPages}
				pageHref={(page) => resolve(href({ search: data.search, filter: data.filter, page }) as '/admin/people')}
			/>
		</div>
	{/if}
</div>
