<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
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
	import OrganizationListFrame, { rowClass } from '$features/platform-admin/components/OrganizationListFrame.svelte';
	import OrganizationListSkeleton from '$features/platform-admin/components/OrganizationListSkeleton.svelte';
	import {
		PLATFORM_ORGANIZATION_STATUS_LABELS,
		PLATFORM_ORGANIZATIONS_MAX_PAGES,
		type PlatformOrganizationFilter,
		type PlatformOrganizationFilterCounts,
		type PlatformOrganizationRow
	} from '$features/platform-admin/organizationSupportTypes';

	let { data } = $props();

	const FILTERS: { value: PlatformOrganizationFilter; label: string; count: keyof PlatformOrganizationFilterCounts }[] =
		[
			{ value: 'all', label: 'All', count: 'all' },
			{ value: 'active-week', label: 'Active this week', count: 'activeWeek' },
			{ value: 'quiet', label: 'Quiet 30+ days', count: 'quiet' },
			{ value: 'suspended', label: 'Suspended', count: 'suspended' }
		];

	// The last settled read stays on screen while the next one loads. The chips keep their counts through a filter
	// change and the rows keep their place through Load more; only a new search or filter swaps in the skeleton.
	const region = settleRead(() => {
		const { q, filter, pages } = data.query;
		return {
			source: data.directory,
			group: q,
			promise: data.directory.then((result) => ({ result, filter, pages }))
		};
	});
	const settled = $derived(region.settled?.group === data.query.q ? region.settled.value : null);
	const view = $derived(settled && settled.filter === data.query.filter ? settled : null);
	const page = $derived(view?.result.status === 'ready' ? view.result.page : null);
	const counts = $derived(settled?.result.status === 'ready' ? settled.result.page.counts : null);
	const loadingMore = $derived(region.settled?.source !== data.directory);

	function listHref(next: { pages?: number; q: string; filter: string }): string {
		const params = new SvelteURLSearchParams();
		if (next.pages && next.pages > 1) params.set('pages', String(next.pages));
		if (next.q) params.set('q', next.q);
		if (next.filter !== 'all') params.set('filter', next.filter);
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

	function ownerLabel(org: PlatformOrganizationRow): string {
		if (org.ownerCount === 0) return 'No owner';
		if (org.ownerCount > 1) return 'Multiple owners';
		return org.ownerEmail ?? 'Owner email unavailable';
	}
</script>

<svelte:head>
	<title>Organizations - Admin - Troop to Task</title>
</svelte:head>

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
		<p
			class="inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase max-lg:hidden lg:ml-auto"
		>
			Sorted by last active <ArrowDown class="size-3" aria-hidden="true" />
		</p>
	</div>

	{#if view === null}
		<OrganizationListSkeleton />
	{:else if view.result.status === 'failed'}
		<Alert.Root variant="destructive">
			<Alert.Title>Organizations could not be loaded.</Alert.Title>
			<Alert.Description>
				<span>Nothing was changed. Try again, and reload the page if it keeps failing.</span>
				<span class="mt-2 block">
					<Button variant="outline" size="sm" onclick={() => invalidateAll()}>Try again</Button>
				</span>
			</Alert.Description>
		</Alert.Root>
	{:else if view.result.page.organizations.length === 0}
		<Empty.Root class="rounded-lg border">
			<Empty.Header>
				<Empty.Title>No matching Organizations.</Empty.Title>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<OrganizationListFrame>
			{#each view.result.page.organizations as org (org.id)}
				<li class="{rowClass} relative hover:bg-muted/50">
					<div class="grid min-w-0 lg:contents">
						<a
							href={resolve(`/admin/organizations/${org.id}` as `/admin/organizations/${string}`)}
							class="min-w-0 font-semibold wrap-anywhere text-foreground after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
							>{org.name}</a
						>
						<p class="min-w-0 text-sm wrap-anywhere text-muted-foreground">{ownerLabel(org)}</p>
					</div>
					<dl class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5 lg:contents">
						<div>
							<dt class="text-xs text-muted-foreground lg:sr-only">Members</dt>
							<dd class="tabular-nums">{org.memberCount}</dd>
						</div>
						<div>
							<dt class="text-xs text-muted-foreground lg:sr-only">Personnel</dt>
							<dd class="tabular-nums">{org.personnelCount}</dd>
						</div>
						<div>
							<dt class="text-xs text-muted-foreground lg:sr-only">Last active</dt>
							<dd>{org.lastActiveAt ? formatRelativeDate(org.lastActiveAt) : 'Never used'}</dd>
						</div>
						<div>
							<dt class="text-xs text-muted-foreground lg:sr-only">Created</dt>
							<dd>{formatDisplayDate(org.createdAt)}</dd>
						</div>
						<div>
							<dt class="text-xs text-muted-foreground lg:sr-only">Status</dt>
							<dd>
								<Badge variant={adminBadgeVariant(org.status)} mono>
									{PLATFORM_ORGANIZATION_STATUS_LABELS[org.status]}
								</Badge>
							</dd>
						</div>
					</dl>
				</li>
			{/each}
		</OrganizationListFrame>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
				Showing {view.result.page.organizations.length} of {view.result.page.totalCount}
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
