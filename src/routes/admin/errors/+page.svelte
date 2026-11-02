<script lang="ts">
	import { enhance } from '$app/forms';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { ErrorGroup, ErrorGroupStatus } from '$features/error-reporting/contracts';
	import AdminPage from '$features/platform-admin/components/AdminPage.svelte';
	import AdminPageHeader from '$features/platform-admin/components/AdminPageHeader.svelte';
	import { createClientClock } from '$features/platform-admin/components/people/clientClock.svelte';
	import { settleRead } from '$features/platform-admin/components/inbox/settle.svelte';
	import {
		ERROR_KIND_LABELS,
		ERROR_STATUS_FILTERS,
		describeErrorLocation,
		type ErrorGroupRegion
	} from '$features/platform-admin/errorTypes';
	import { inboxHref } from '$features/platform-admin/inboxTypes';
	import { formatAgo } from '$features/platform-admin/peopleFormat';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { DataTable, useServerDataTable, type ColumnDef } from '$lib/components/ui/data-table';
	import * as Empty from '$lib/components/ui/empty';
	import { Spinner } from '$lib/components/ui/spinner';
	import { formatDisplayDate } from '$lib/utils/dates';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const PAGE_SIZE = 25;
	const COLUMNS: ColumnDef<ErrorGroup>[] = [
		{ key: 'error', header: 'Error', value: (group) => group.message, rowHeader: true, sortable: false, width: '42%' },
		{ key: 'count', header: 'Count', value: (group) => group.occurrenceCount, sortable: false },
		{ key: 'people', header: 'People', value: (group) => group.affectedUsers, sortable: false },
		{ key: 'seen', header: 'Last seen', value: (group) => group.lastSeenAt, sortable: false },
		{ key: 'first', header: 'First seen', value: (group) => group.firstSeenAt, sortable: false, hiddenBelow: '@3xl' },
		{ key: 'reports', header: 'Reports', value: (group) => group.reports.length, sortable: false, hiddenBelow: '@xl' },
		{ key: 'action', header: 'Action', value: (group) => group.status, sortable: false }
	];

	const clock = createClientClock();
	const unavailable: ErrorGroupRegion = { status: 'error', message: 'Unable to load Errors' };
	const view = $derived(`${data.status}|${data.page}`);
	const region = settleRead(() => ({
		source: data.errors,
		group: `${data.status}|${data.page}`,
		promise: data.errors.catch(() => unavailable)
	}));
	// A different filter or page never shows another one's rows.
	const settled = $derived(region.settled?.group === view ? region.settled.value : null);
	const result = $derived(settled?.status === 'ok' ? settled.data : null);

	let resolving = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	const displayedError = $derived(actionError ?? (form && 'error' in form ? form.error : null));

	function show(next: { status?: ErrorGroupStatus; page?: number }) {
		const status = next.status ?? data.status;
		const page = next.page ?? 1;
		const params = new SvelteURLSearchParams();
		if (status === 'resolved') params.set('status', 'resolved');
		if (page > 1) params.set('page', String(page));
		const query = params.toString();
		return goto(resolve((query ? `/admin/errors?${query}` : '/admin/errors') as '/admin/errors'), { reset: false });
	}

	const table = useServerDataTable<ErrorGroup>({
		rows: () => result?.groups ?? [],
		columns: () => COLUMNS,
		sort: () => ({ key: 'seen', direction: 'desc' }),
		onSort: () => {},
		paging: {
			page: () => data.page,
			pageSize: PAGE_SIZE,
			totalRows: () => result?.total ?? 0,
			onPage: (page) => void show({ page })
		}
	});

	const eyebrow = $derived(result ? `Platform · ${result.total} ${data.status}` : 'Platform');
	const emptyTitle = $derived(
		data.status === 'open' ? 'No open errors in the last 30 days.' : 'Nothing resolved recently.'
	);

	function resolveGroup(groupId: string) {
		const onView = view;
		const actor = data.adminUserId;
		resolving = groupId;
		actionError = null;
		return async ({ result: reply, update }: { result: { type: string }; update: () => Promise<void> }) => {
			// A reply for another filter, page or operator no longer belongs on screen.
			if (resolving === groupId) resolving = null;
			if (onView !== view || actor !== data.adminUserId) return;
			if (reply.type === 'failure' || reply.type === 'error') {
				actionError = 'Could not resolve this error. Reload before trying again.';
				return;
			}
			await update();
		};
	}
</script>

<svelte:head>
	<title>Errors - Platform Admin</title>
</svelte:head>

{#snippet cell(group: ErrorGroup, column: ColumnDef<ErrorGroup>)}
	{#if column.key === 'error'}
		<span class="grid min-w-0 gap-1 font-normal">
			<span class="flex flex-wrap items-center gap-2">
				<span class="text-base font-semibold text-foreground">{group.name}</span>
				<Badge variant="danger" mono>{ERROR_KIND_LABELS[group.kind]}</Badge>
				{#if group.origin === 'client_reported'}<Badge variant="outline" mono>Browser</Badge>{/if}
			</span>
			<span class="line-clamp-2 text-sm break-words text-foreground">{group.message}</span>
			<span class="truncate font-mono text-xs text-muted-foreground">{describeErrorLocation(group)}</span>
		</span>
	{:else if column.key === 'count'}
		{group.occurrenceCount} {group.occurrenceCount === 1 ? 'time' : 'times'}
	{:else if column.key === 'people'}
		{group.affectedUsers} {group.affectedUsers === 1 ? 'person' : 'people'}
	{:else if column.key === 'seen'}
		{#if clock.now}
			{formatAgo(group.lastSeenAt, clock.now)}
		{:else}
			<span class="invisible">00 min ago</span>
		{/if}
	{:else if column.key === 'first'}
		{formatDisplayDate(group.firstSeenAt)}
	{:else if column.key === 'reports'}
		{#if group.reports.length === 0}
			<span class="text-muted-foreground">None</span>
		{:else}
			<span class="flex flex-wrap gap-x-3 gap-y-1">
				{#each group.reports as report (report.id)}
					<a
						href={resolve(
							inboxHref({ tab: 'open', filter: 'all', item: { kind: 'feedback', id: report.id } }) as '/admin'
						)}
						aria-label={`Feedback report from ${formatDisplayDate(report.createdAt)}`}
						class="text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					>
						{formatDisplayDate(report.createdAt)}
					</a>
				{/each}
			</span>
		{/if}
	{:else if group.status === 'open'}
		<form method="POST" action="?/resolve" use:enhance={() => resolveGroup(group.id)}>
			<input type="hidden" name="id" value={group.id} />
			<Button
				type="submit"
				variant="outline"
				size="sm"
				aria-label={`Resolve ${group.name}: ${group.message}`}
				aria-disabled={resolving === group.id ? 'true' : undefined}
				aria-busy={resolving === group.id || undefined}
				onclick={(event) => {
					if (resolving === group.id) event.preventDefault();
				}}
			>
				{#if resolving === group.id}<Spinner />{/if}
				Resolve
			</Button>
		</form>
	{:else}
		<span class="text-sm text-muted-foreground">
			{group.resolvedAt ? `Resolved ${formatDisplayDate(group.resolvedAt)}` : 'Resolved'}
		</span>
	{/if}
{/snippet}

<AdminPage>
	<AdminPageHeader
		{eyebrow}
		title="Errors"
		description="Failures people hit, grouped by cause so one bug counts once. A resolved error reopens if it happens again."
	/>

	<div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
		<SegmentedFilter.Root
			label="Filter errors"
			options={ERROR_STATUS_FILTERS}
			bind:value={() => data.status, (next) => void show({ status: next })}
		/>
		<p class="text-sm text-muted-foreground">Last 30 days</p>
	</div>

	{#if displayedError}
		<Alert.Root variant="destructive" role="alert">
			<Alert.Description>{displayedError}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if settled?.status === 'error'}
		<Alert.Root variant="destructive">
			<Alert.Title>Unable to load Errors</Alert.Title>
			<Alert.Description>The list could not be loaded. Your filter is unchanged.</Alert.Description>
			<div class="mt-3">
				<Button variant="outline" onclick={() => void invalidate('admin:errors')}>Retry Errors</Button>
			</div>
		</Alert.Root>
	{:else if result?.groups.length === 0}
		<Empty.Root>
			<Empty.Header>
				<Empty.Title>{emptyTitle}</Empty.Title>
			</Empty.Header>
		</Empty.Root>
	{:else}
		{#if settled === null}<p class="sr-only" role="status" aria-label="Loading errors">Loading errors</p>{/if}
		<DataTable
			{table}
			variant="editorial"
			stacked
			ariaLabel="Errors"
			loading={settled === null}
			loadingRows={6}
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
