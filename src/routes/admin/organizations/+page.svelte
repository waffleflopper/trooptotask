<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { WorkspaceToolbar, type ToolbarItem } from '$lib/components/patterns/workspace-toolbar';
	import { formatDisplayDate, formatRelativeDate } from '$lib/utils/dates';
	import AdminPageHeader from '$features/platform-admin/components/AdminPageHeader.svelte';
	import AdminPager from '$features/platform-admin/components/AdminPager.svelte';
	import { createAdminUrlSearch } from '$features/platform-admin/components/adminUrlSearch.svelte';
	import { adminBadgeVariant } from '$features/platform-admin/components/adminTheme';
	import OrganizationListFrame, { rowClass } from '$features/platform-admin/components/OrganizationListFrame.svelte';
	import OrganizationListSkeleton from '$features/platform-admin/components/OrganizationListSkeleton.svelte';
	import {
		PLATFORM_ORGANIZATION_STATUS_LABELS,
		type PlatformOrganizationFilter,
		type PlatformOrganizationFilterCounts,
		type PlatformOrganizationPage,
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

	// The last settled page stays on screen beside a pending one, so the filter counts and the pager hold
	// still while the next page's rows load. The pager is the focus target of a keyboard operator mid-paging.
	let settled = $state.raw<{
		promise: typeof data.directory;
		q: string;
		filter: string;
		page: PlatformOrganizationPage;
	} | null>(null);

	$effect(() => {
		const promise = data.directory;
		const { q, filter } = data.query;
		void promise.then((result) => {
			if (promise !== data.directory) return;
			settled = result.status === 'ready' ? { promise, q, filter, page: result.page } : null;
		});
	});

	const sameSearch = $derived(settled !== null && settled.q === data.query.q);
	const counts = $derived(sameSearch ? (settled?.page.counts ?? null) : null);
	const pager = $derived(
		settled !== null && sameSearch && settled.filter === data.query.filter && settled.page.organizations.length > 0
			? settled
			: null
	);

	function listHref(next: { page?: number; q: string; filter: string }): string {
		const params = new SvelteURLSearchParams();
		if (next.page && next.page > 1) params.set('page', String(next.page));
		if (next.q) params.set('q', next.q);
		if (next.filter !== 'all') params.set('filter', next.filter);
		const query = params.toString();
		return `${resolve('/admin/organizations')}${query ? `?${query}` : ''}`;
	}

	const search = createAdminUrlSearch(
		() => data.query.q,
		(q) => goto(listHref({ q, filter: data.query.filter }), { keepFocus: true })
	);

	const toolbarItems = $derived<ToolbarItem[]>([
		{
			kind: 'view',
			id: 'filter',
			label: 'Show',
			options: FILTERS.map(({ value, label, count }) => ({
				value,
				label,
				count: counts?.[count] ?? ('pending' as const)
			})),
			value: data.query.filter,
			onValueChange: (filter) => goto(listHref({ q: search.value, filter }), { keepFocus: true })
		}
	]);

	function ownerLabel(org: PlatformOrganizationRow): string {
		if (org.ownerCount === 0) return 'No owner';
		if (org.ownerCount > 1) return 'Multiple owners';
		return org.ownerEmail ?? 'Owner email unavailable';
	}
</script>

<svelte:head>
	<title>Organizations - Admin - Troop to Task</title>
</svelte:head>

{#snippet header(eyebrow: string)}
	<AdminPageHeader
		{eyebrow}
		title="Organizations"
		description="Every unit on the platform, most recently active first."
	/>
{/snippet}

<PageShell.Root width="wide">
	{#await data.directory}
		{@render header('Platform')}
	{:then result}
		<!-- The count is the whole platform; a search or filter narrows it, so the eyebrow drops the number then. -->
		{@render header(
			result.status === 'ready' && data.query.q === '' && data.query.filter === 'all'
				? `Platform · ${result.page.totalCount} ${result.page.totalCount === 1 ? 'Organization' : 'Organizations'}`
				: 'Platform'
		)}
	{/await}

	<WorkspaceToolbar
		ariaLabel="Organizations controls"
		items={toolbarItems}
		search={{
			label: 'Search',
			placeholder: 'Search name or owner email',
			value: search.value,
			onValueChange: search.setValue
		}}
	/>

	{#await data.directory}
		<OrganizationListSkeleton />
	{:then result}
		{#if result.status === 'failed'}
			<Alert.Root variant="destructive">
				<Alert.Title>Organizations could not be loaded.</Alert.Title>
				<Alert.Description>
					<span>Nothing was changed. Try again, and reload the page if it keeps failing.</span>
					<span class="mt-2 block">
						<Button variant="outline" size="sm" onclick={() => invalidateAll()}>Try again</Button>
					</span>
				</Alert.Description>
			</Alert.Root>
		{:else if result.page.organizations.length === 0}
			<Empty.Root class="rounded-lg border">
				<Empty.Header>
					<Empty.Title>No matching Organizations.</Empty.Title>
				</Empty.Header>
			</Empty.Root>
		{:else}
			<OrganizationListFrame>
				{#each result.page.organizations as org (org.id)}
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
									<Badge variant={adminBadgeVariant(org.status)}
										>{PLATFORM_ORGANIZATION_STATUS_LABELS[org.status]}</Badge
									>
								</dd>
							</div>
						</dl>
					</li>
				{/each}
			</OrganizationListFrame>
		{/if}
	{/await}

	{#if pager}
		{@const page = pager.page}
		<div class="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
			{#if pager.promise === data.directory}
				<p class="font-mono text-xs tracking-[0.08em] uppercase">
					Showing {(page.page - 1) * page.pageSize + 1}-{(page.page - 1) * page.pageSize + page.organizations.length} of
					{page.totalCount}
				</p>
			{:else}
				<Skeleton class="h-4 w-36" />
			{/if}
			<AdminPager
				page={pager.promise === data.directory ? page.page : data.query.page}
				totalPages={page.totalPages}
				pageHref={(next) => listHref({ page: next, q: data.query.q, filter: data.query.filter })}
			/>
		</div>
	{/if}
</PageShell.Root>
