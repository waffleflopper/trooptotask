<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as PageShell from '$lib/components/ui/page-shell';
	import * as Table from '$lib/components/ui/table';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { adminBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let { data } = $props();

	const organizationsRouteRoot = resolve('/admin/organizations');
	const tierFilter = $derived(data.pagination.tier ?? 'all');
	const statusFilter = $derived(data.pagination.status ?? 'all');

	const showingStart = $derived(
		data.organizations.length === 0 ? 0 : (data.pagination.page - 1) * data.pagination.pageSize + 1
	);
	const showingEnd = $derived(
		data.organizations.length === 0
			? 0
			: Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalCount)
	);

	function pageHref(pageNumber: number): string {
		const params = new SvelteURLSearchParams();
		params.set('page', pageNumber.toString());
		params.set('pageSize', data.pagination.pageSize.toString());
		if (data.pagination.q) params.set('q', data.pagination.q);
		if (tierFilter !== 'all') params.set('tier', tierFilter);
		if (statusFilter !== 'all') params.set('status', statusFilter);
		return `${organizationsRouteRoot}?${params.toString()}`;
	}
</script>

<svelte:head>
	<title>Organizations - Admin - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide">
	<PageShell.Header
		title="Organizations"
		subtitle="Review organization health, ownership, plan state, and suspension status from the central platform index."
	/>

	<PageShell.FactGrid layout="two">
		<PageShell.Metric
			label="Matching Organizations"
			value={data.pagination.totalCount}
			detail="Organizations matching the current search."
		/>
		<PageShell.Metric
			label="Current Page"
			value={data.organizations.length}
			detail={`Page ${data.pagination.page} of ${data.pagination.totalPages}.`}
		/>
	</PageShell.FactGrid>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
			<form
				method="GET"
				action={organizationsRouteRoot}
				class="grid flex-1 gap-3 xl:grid-cols-[minmax(16rem,1fr)_9rem_minmax(10rem,1fr)_minmax(10rem,1fr)_auto] xl:items-end"
			>
				<input type="hidden" name="page" value="1" />
				<Field.Root>
					<Field.Label for="org-search">Search</Field.Label>
					<Input
						id="org-search"
						name="q"
						type="search"
						placeholder="Search by organization name..."
						value={data.pagination.q}
					/>
				</Field.Root>
				<Field.Root>
					<Field.Label for="org-page-size">Rows</Field.Label>
					<NativeSelect id="org-page-size" name="pageSize" value={String(data.pagination.pageSize)}>
						<option value="25">25</option>
						<option value="50">50</option>
						<option value="100">100</option>
					</NativeSelect>
				</Field.Root>
				<Field.Root>
					<Field.Label for="tier-filter">Tier</Field.Label>
					<NativeSelect id="tier-filter" name="tier" value={tierFilter}>
						<option value="all">All tiers</option>
						<option value="free">Free</option>
						<option value="team">Team</option>
						<option value="unit">Unit</option>
					</NativeSelect>
				</Field.Root>
				<Field.Root>
					<Field.Label for="status-filter">Status</Field.Label>
					<NativeSelect id="status-filter" name="status" value={statusFilter}>
						<option value="all">All statuses</option>
						<option value="active">Active</option>
						<option value="suspended">Suspended</option>
					</NativeSelect>
				</Field.Root>
				<Button type="submit" variant="outline">Apply</Button>
			</form>
			<span class="text-sm text-muted-foreground">{data.organizations.length} shown</span>
		</Card.Content>
	</Card.Root>

	<Card.Root class="overflow-hidden">
		<div class="overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Tier</Table.Head>
						<Table.Head>Members</Table.Head>
						<Table.Head>Personnel</Table.Head>
						<Table.Head>Owner</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Created</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.organizations as org (org.id)}
						<Table.Row>
							<Table.Cell>
								<div class="grid min-w-48 gap-1">
									<a
										href={resolve(`/admin/organizations/${org.id}` as `/admin/organizations/${string}`)}
										class="font-medium">{org.name}</a
									>
									<code class="w-fit rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
										{org.id.slice(0, 8)}...
									</code>
								</div>
							</Table.Cell>
							<Table.Cell>
								<div class="flex flex-wrap gap-2">
									<Badge variant={adminBadgeVariant(org.effectiveTier)}>{formatAdminLabel(org.effectiveTier)}</Badge>
									{#if org.gift_tier}
										<Badge variant="warning">Gift</Badge>
									{/if}
								</div>
							</Table.Cell>
							<Table.Cell>{org.memberCount}</Table.Cell>
							<Table.Cell>{org.personnelCount}</Table.Cell>
							<Table.Cell class="max-w-60 break-words text-muted-foreground">{org.ownerEmail || '-'}</Table.Cell>
							<Table.Cell>
								<Badge variant={adminBadgeVariant(org.isSuspended ? 'suspended' : 'active')}>
									{org.isSuspended ? 'Suspended' : 'Active'}
								</Badge>
							</Table.Cell>
							<Table.Cell>{formatDisplayDate(org.created_at)}</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={7}>
								<Empty.Root>
									<Empty.Header>
										<Empty.Title>No matching organizations.</Empty.Title>
									</Empty.Header>
								</Empty.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</Card.Root>

	{#if data.pagination.totalCount > 0}
		<div class="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
			<p>Showing {showingStart}-{showingEnd} of {data.pagination.totalCount}</p>
			{#if data.pagination.totalPages > 1}
				<div class="flex flex-wrap items-center gap-3">
					<Button
						href={pageHref(data.pagination.page - 1)}
						variant="outline"
						size="sm"
						disabled={data.pagination.page === 1}
					>
						Previous
					</Button>
					<span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
					<Button
						href={pageHref(data.pagination.page + 1)}
						variant="outline"
						size="sm"
						disabled={data.pagination.page === data.pagination.totalPages}
					>
						Next
					</Button>
				</div>
			{/if}
		</div>
	{/if}
</PageShell.Root>
