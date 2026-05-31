<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { Badge } from '$lib/components/ui/badge';
	import { adminBadgeVariant } from '$lib/components/admin/adminTheme';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import * as PageShell from '$lib/components/ui/page-shell';
	import * as Table from '$lib/components/ui/table';

	let { data } = $props();
	let searchInput = $derived(data.search);

	function applyFilters() {
		const params = new SvelteURLSearchParams();
		if (searchInput) params.set('search', searchInput);
		params.set('page', '1');
		goto(resolve(`/admin/users?${params.toString()}`));
	}

	function goToPage(pageNum: number) {
		const params = new SvelteURLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(resolve(`/admin/users?${params.toString()}`));
	}

	const totalPages = $derived(Math.ceil(data.totalCount / data.limit));
</script>

<svelte:head>
	<title>Users - Admin - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide">
	<PageShell.Header title="Users" subtitle="Search, inspect, and manage platform identities across every organization.">
		{#snippet meta()}
			<Badge variant="secondary">Identity Ledger</Badge>
		{/snippet}
		{#snippet actions()}
			<Button href="/admin/access-requests">Open Access Requests</Button>
		{/snippet}
	</PageShell.Header>

	<PageShell.FactGrid layout="two">
		<PageShell.Metric
			label="Directory Size"
			value={data.totalCount}
			detail="Total user accounts currently indexed by the platform."
		/>
		<PageShell.Metric label="Page" value={data.page}>
			Reviewing page {data.page} of {Math.max(totalPages, 1)} in the user ledger.
		</PageShell.Metric>
	</PageShell.FactGrid>

	{#if data.authError}
		<Alert.Root variant="destructive">
			<Alert.Title>Failed to load users</Alert.Title>
			<Alert.Description>{data.authError}</Alert.Description>
		</Alert.Root>
	{/if}

	<Card.Root>
		<Card.Header class="gap-3 sm:flex-row sm:items-end sm:justify-between">
			<form
				class="grid gap-3 sm:grid-cols-[minmax(16rem,1fr)_auto] sm:items-end"
				onsubmit={(event) => {
					event.preventDefault();
					applyFilters();
				}}
			>
				<Field.Root>
					<Field.Label for="users-search">Search</Field.Label>
					<Field.Control>
						<Input id="users-search" type="text" placeholder="Search by email..." bind:value={searchInput} />
					</Field.Control>
				</Field.Root>
				<Button type="submit" variant="outline">Apply</Button>
			</form>
			<p class="text-sm text-muted-foreground">{data.users.length} shown</p>
		</Card.Header>
		<Card.Content class="overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>User</Table.Head>
						<Table.Head>Organizations</Table.Head>
						<Table.Head>Joined</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head class="text-right"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.users as user (user.id)}
						<Table.Row>
							<Table.Cell>
								<div class="grid gap-1">
									<strong class="text-sm font-medium">{user.email || 'No email'}</strong>
									<span class="font-mono text-xs text-muted-foreground">{user.id.slice(0, 8)}...</span>
								</div>
							</Table.Cell>
							<Table.Cell>{user.organizationCount}</Table.Cell>
							<Table.Cell>{formatDisplayDate(user.createdAt)}</Table.Cell>
							<Table.Cell>
								<Badge variant={adminBadgeVariant(user.isSuspended ? 'suspended' : 'active')}>
									{user.isSuspended ? 'Suspended' : 'Active'}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-right">
								<Button href="/admin/users/{user.id}" variant="outline" size="sm">Inspect</Button>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={5}>
								<Empty.Root class="border-0">No users found.</Empty.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	{#if totalPages > 1}
		<div class="flex flex-wrap items-center justify-end gap-3 text-sm text-muted-foreground">
			<Button variant="outline" size="sm" disabled={data.page <= 1} onclick={() => goToPage(data.page - 1)}>
				Previous
			</Button>
			<span>Page {data.page} of {totalPages}</span>
			<Button variant="outline" size="sm" disabled={data.page >= totalPages} onclick={() => goToPage(data.page + 1)}>
				Next
			</Button>
		</div>
	{/if}
</PageShell.Root>
