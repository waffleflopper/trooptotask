<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { DataTable, useServerDataTable, type ColumnDef } from '$lib/components/ui/data-table';
	import * as Empty from '$lib/components/ui/empty';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter';
	import { WorkspaceToolbar } from '$lib/components/patterns/workspace-toolbar';
	import { Spinner } from '$lib/components/ui/spinner';
	import { formatDisplayDate, formatRelativeDate } from '$lib/utils/dates';
	import AdminPage from '$features/platform-admin/components/AdminPage.svelte';
	import AdminPageHeader from '$features/platform-admin/components/AdminPageHeader.svelte';
	import { createAdminUrlSearch } from '$features/platform-admin/components/adminUrlSearch.svelte';
	import { adminBadgeVariant } from '$features/platform-admin/components/adminTheme';
	import { settleRead } from '$features/platform-admin/components/inbox/settle.svelte';
	import { nextAdminSort, ORGANIZATION_SORT, writeAdminSort } from '$features/platform-admin/adminSort';
	import {
		PLATFORM_ORGANIZATION_STATUS_LABELS,
		PLATFORM_ORGANIZATIONS_MAX_PAGES,
		type PlatformOrganizationFilter,
		type PlatformOrganizationFilterCounts,
		type PlatformOrganizationRow,
		type PlatformOrganizationSort
	} from '$features/platform-admin/organizationSupportTypes';

	let { data } = $props();

	const FILTERS: { value: PlatformOrganizationFilter; label: string; count: keyof PlatformOrganizationFilterCounts }[] =
		[
			{ value: 'all', label: 'All', count: 'all' },
			{ value: 'active-week', label: 'Active this week', count: 'activeWeek' },
			{ value: 'quiet', label: 'Quiet 30+ days', count: 'quiet' },
			{ value: 'suspended', label: 'Suspended', count: 'suspended' }
		];

	const COLUMNS: ColumnDef<PlatformOrganizationRow>[] = [
		{ key: 'name', header: 'Organization', value: (org) => org.name, rowHeader: true, width: '24%' },
		{ key: 'owner', header: 'Owner', value: (org) => org.ownerEmail, width: '22%', hiddenBelow: '@3xl' },
		{ key: 'members', header: 'Members', value: (org) => org.memberCount, align: 'right' },
		{ key: 'personnel', header: 'Personnel', value: (org) => org.personnelCount, align: 'right' },
		{ key: 'lastActive', header: 'Last active', value: (org) => org.lastActiveAt },
		{ key: 'created', header: 'Created', value: (org) => org.createdAt, hiddenBelow: '@3xl' },
		{ key: 'status', header: 'Status', value: (org) => org.status }
	];

	// The last settled read stays on screen while the next one loads. The chips keep their counts through a filter
	// change and the rows keep their place through Load more; only a new search, filter or order swaps in the skeleton.
	const region = settleRead(() => {
		const { q, filter, pages, sort } = data.query;
		return {
			source: data.directory,
			group: q,
			promise: data.directory.then((result) => ({ result, filter, pages, sort }))
		};
	});
	const settled = $derived(region.settled?.group === data.query.q ? region.settled.value : null);
	const view = $derived(
		settled &&
			settled.filter === data.query.filter &&
			settled.sort.key === data.query.sort.key &&
			settled.sort.direction === data.query.sort.direction
			? settled
			: null
	);
	const page = $derived(view?.result.status === 'ready' ? view.result.page : null);
	const counts = $derived(settled?.result.status === 'ready' ? settled.result.page.counts : null);
	const loadingMore = $derived(region.settled?.source !== data.directory);

	function listHref(next: { pages?: number; q: string; filter: string; sort?: PlatformOrganizationSort }): string {
		const params = new SvelteURLSearchParams();
		if (next.pages && next.pages > 1) params.set('pages', String(next.pages));
		if (next.q) params.set('q', next.q);
		if (next.filter !== 'all') params.set('filter', next.filter);
		writeAdminSort(ORGANIZATION_SORT, next.sort ?? data.query.sort, params);
		const query = params.toString();
		return `${resolve('/admin/organizations')}${query ? `?${query}` : ''}`;
	}

	const search = createAdminUrlSearch(
		() => data.query.q,
		(q) => goto(listHref({ q, filter: data.query.filter }), { keepFocus: true, noScroll: true, replaceState: true })
	);

	const filterOptions = $derived(
		FILTERS.map(({ value, label, count }) => ({
			value,
			label,
			count: settled?.result.status === 'failed' ? undefined : (counts?.[count] ?? null)
		}))
	);

	const eyebrow = $derived(
		page && data.query.q === '' && data.query.filter === 'all'
			? `Platform · ${page.totalCount} ${page.totalCount === 1 ? 'Organization' : 'Organizations'}`
			: 'Platform'
	);
	const canLoadMore = $derived(
		page !== null && page.organizations.length < page.totalCount && data.query.pages < PLATFORM_ORGANIZATIONS_MAX_PAGES
	);

	function loadMore() {
		const { q, filter, pages } = data.query;
		void goto(listHref({ pages: pages + 1, q, filter }), { keepFocus: true, noScroll: true, replaceState: true });
	}

	const table = useServerDataTable<PlatformOrganizationRow>({
		rows: () => page?.organizations ?? [],
		columns: () => COLUMNS,
		sort: () => data.query.sort,
		onSort: (key) => {
			const sort = nextAdminSort(ORGANIZATION_SORT, data.query.sort, key as PlatformOrganizationSort['key']);
			void goto(listHref({ q: data.query.q, filter: data.query.filter, sort }), { keepFocus: true, noScroll: true });
		}
	});

	function ownerLabel(org: PlatformOrganizationRow): string {
		if (org.ownerCount === 0) return 'No owner';
		if (org.ownerCount > 1) return 'Multiple owners';
		return org.ownerEmail ?? 'Owner email unavailable';
	}
</script>

<svelte:head>
	<title>Organizations - Admin - Troop to Task</title>
</svelte:head>

{#snippet cell(org: PlatformOrganizationRow, column: ColumnDef<PlatformOrganizationRow>)}
	{#if column.key === 'name'}
		<a
			href={resolve(`/admin/organizations/${org.id}` as `/admin/organizations/${string}`)}
			class="font-semibold wrap-anywhere text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>{org.name}</a
		>
	{:else if column.key === 'owner'}
		<span class="wrap-anywhere text-muted-foreground">{ownerLabel(org)}</span>
	{:else if column.key === 'members'}
		<span class="tabular-nums">{org.memberCount}</span>
	{:else if column.key === 'personnel'}
		<span class="tabular-nums">{org.personnelCount}</span>
	{:else if column.key === 'lastActive'}
		{org.lastActiveAt ? formatRelativeDate(org.lastActiveAt) : 'Never used'}
	{:else if column.key === 'created'}
		{formatDisplayDate(org.createdAt)}
	{:else}
		<Badge variant={adminBadgeVariant(org.status)} mono>{PLATFORM_ORGANIZATION_STATUS_LABELS[org.status]}</Badge>
	{/if}
{/snippet}

<AdminPage>
	<AdminPageHeader
		{eyebrow}
		title="Organizations"
		description="Every unit on the platform, most recently active first."
	/>

	<div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
		<div class="w-full min-w-0 sm:w-80">
			<WorkspaceToolbar
				ariaLabel="Organizations controls"
				bare
				items={[]}
				search={{
					label: 'Search',
					placeholder: 'Search name or owner email',
					value: search.value,
					onValueChange: search.setValue
				}}
			/>
		</div>
		<SegmentedFilter.Root
			label="Filter Organizations"
			options={filterOptions}
			bind:value={
				() => data.query.filter,
				(filter) => void goto(listHref({ q: search.value, filter }), { keepFocus: true, noScroll: true })
			}
		/>
	</div>

	{#if view?.result.status === 'failed'}
		<Alert.Root variant="destructive">
			<Alert.Title>Organizations could not be loaded.</Alert.Title>
			<Alert.Description>
				<span>Nothing was changed. Try again, and reload the page if it keeps failing.</span>
				<span class="mt-2 block">
					<Button variant="outline" size="sm" onclick={() => invalidateAll()}>Try again</Button>
				</span>
			</Alert.Description>
		</Alert.Root>
	{:else if page?.organizations.length === 0}
		<Empty.Root class="rounded-lg border">
			<Empty.Header>
				<Empty.Title>No matching Organizations.</Empty.Title>
			</Empty.Header>
		</Empty.Root>
	{:else}
		{#if view === null}<p class="sr-only" role="status">Loading organizations</p>{/if}
		<DataTable
			{table}
			variant="editorial"
			stacked
			ariaLabel="Organizations"
			loading={view === null}
			loadingRows={8}
			stickyHeader={false}
			{cell}
		/>
	{/if}
	{#if page && page.organizations.length > 0}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
				Showing {page.organizations.length} of {page.totalCount}
			</p>
			{#if canLoadMore}
				<Button variant="outline" size="sm" disabled={loadingMore} onclick={loadMore}>
					{#if loadingMore}<Spinner />{/if}
					Load more
				</Button>
			{/if}
		</div>
	{/if}
</AdminPage>
