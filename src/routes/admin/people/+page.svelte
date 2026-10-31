<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { IdentityPeoplePage, IdentityPerson, PeopleFilter, PeopleSort } from '$features/identity/contracts';
	import { nextAdminSort, PEOPLE_SORT, writeAdminSort } from '$features/platform-admin/adminSort';
	import AdminPage from '$features/platform-admin/components/AdminPage.svelte';
	import AdminPageHeader from '$features/platform-admin/components/AdminPageHeader.svelte';
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
	import { DataTable, useServerDataTable, type ColumnDef } from '$lib/components/ui/data-table';
	import * as Empty from '$lib/components/ui/empty';
	import { formatDisplayDate } from '$lib/utils/dates';

	let { data } = $props();

	const FILTERS: ReadonlyArray<{ value: PeopleFilter; label: string }> = [
		{ value: 'all', label: 'All' },
		{ value: 'notSetUp', label: 'Not set up' },
		{ value: 'suspended', label: 'Suspended' }
	];
	const PAGE_SIZE = 20;
	const COLUMNS: ColumnDef<IdentityPerson>[] = [
		{ key: 'person', header: 'Person', value: (person) => person.name, rowHeader: true, width: '40%' },
		{ key: 'organizations', header: 'Organizations', value: (person) => person.organizationCount },
		{ key: 'lastSignIn', header: 'Last sign-in', value: (person) => person.lastSignInAt },
		{ key: 'added', header: 'Added', value: (person) => person.createdAt, hiddenBelow: '@3xl' },
		{ key: 'status', header: 'Status', value: (person) => person.state.kind }
	];

	const clock = createClientClock();
	const unavailable: PersonRegion<IdentityPeoplePage> = { status: 'error', message: 'Unable to load People' };
	const region = settleRead(() => ({
		source: data.people,
		group: `${data.filter}|${data.search}|${data.sort.key}|${data.sort.direction}|${data.page}`,
		promise: data.people.catch(() => unavailable)
	}));
	const group = $derived(`${data.filter}|${data.search}|${data.sort.key}|${data.sort.direction}|${data.page}`);
	// A different filter, search, order or page never shows another one's rows.
	const settled = $derived(region.settled?.group === group ? region.settled.value : null);
	const result = $derived(settled?.status === 'ok' ? settled.data : null);

	type PeopleView = { search: string; filter: PeopleFilter; sort: PeopleSort; page: number };

	function href(next: PeopleView): string {
		const params = new SvelteURLSearchParams();
		if (next.search) params.set('search', next.search);
		if (next.filter !== 'all') params.set('filter', next.filter);
		writeAdminSort(PEOPLE_SORT, next.sort, params);
		if (next.page > 1) params.set('page', String(next.page));
		const query = params.toString();
		return query ? `/admin/people?${query}` : '/admin/people';
	}

	function show(next: Partial<PeopleView>, replaceState = false) {
		const target = href({ search: data.search, filter: data.filter, sort: data.sort, page: 1, ...next });
		return goto(resolve(target as '/admin/people'), { reset: false, replace: replaceState });
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

	const table = useServerDataTable<IdentityPerson>({
		rows: () => result?.people ?? [],
		columns: () => COLUMNS,
		sort: () => data.sort,
		onSort: (key) => void show({ sort: nextAdminSort(PEOPLE_SORT, data.sort, key as PeopleSort['key']) }),
		paging: {
			page: () => result?.page ?? data.page,
			pageSize: PAGE_SIZE,
			totalRows: () => result?.totalCount ?? 0,
			onPage: (page) => void show({ page })
		}
	});
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

{#snippet cell(person: IdentityPerson, column: ColumnDef<IdentityPerson>)}
	{#if column.key === 'person'}
		<span class="grid min-w-0 font-normal">
			<a
				href={resolve(personHref(person.state) as '/admin/people')}
				class="w-fit max-w-full truncate text-base font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>
				{person.name}
			</a>
			{#if person.email !== person.name}
				<span class="truncate font-mono text-xs text-muted-foreground">{person.email ?? 'No email on file'}</span>
			{/if}
		</span>
	{:else if column.key === 'organizations'}
		{organizationsLabel(person.organizationCount, person.state)}
	{:else if column.key === 'lastSignIn'}
		{#if clock.now}
			{formatSignIn(person.lastSignInAt, clock.now)}
		{:else}
			<span class="invisible">00 min ago</span>
		{/if}
	{:else if column.key === 'added'}
		{formatDisplayDate(person.createdAt)}
	{:else}
		{@const view = PERSON_STATE_VIEW[person.state.kind]}
		<Badge variant={view.variant} mono>{view.label}</Badge>
	{/if}
{/snippet}

<AdminPage>
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

	{#if settled?.status === 'error'}
		<Alert.Root variant="destructive">
			<Alert.Title>Unable to load People</Alert.Title>
			<Alert.Description>The list could not be loaded. Your search and filter are unchanged.</Alert.Description>
			<div class="mt-3">
				<Button variant="outline" onclick={() => void invalidate('admin:people')}>Retry People</Button>
			</div>
		</Alert.Root>
	{:else if result?.people.length === 0}
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
		{#if settled === null}<p class="sr-only" role="status" aria-label="Loading people">Loading people</p>{/if}
		<DataTable
			{table}
			variant="editorial"
			stacked
			ariaLabel="People"
			loading={settled === null}
			loadingRows={8}
			stickyHeader={false}
			{cell}
			pageLabels={{
				previous: 'Previous',
				next: 'Next',
				range: ({ first, last, total }) => `Showing ${first}–${last} of ${total}`
			}}
		/>
	{/if}
</AdminPage>
