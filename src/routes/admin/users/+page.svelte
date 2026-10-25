<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { Badge } from '$lib/components/ui/badge';
	import AdminPager from '$features/platform-admin/components/AdminPager.svelte';
	import { createAdminUrlSearch } from '$features/platform-admin/components/adminUrlSearch.svelte';
	import { adminBadgeVariant } from '$features/platform-admin/components/adminTheme';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { WorkspaceToolbar } from '$lib/components/patterns/workspace-toolbar';
	import * as Table from '$lib/components/ui/table';

	let { data } = $props();

	const search = createAdminUrlSearch(
		() => data.search,
		(value) => {
			const params = new SvelteURLSearchParams();
			if (value) params.set('search', value);
			params.set('page', '1');
			goto(resolve(`/admin/users?${params.toString()}`), { keepFocus: true });
		}
	);

	function pageHref(pageNum: number) {
		const params = new SvelteURLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		return resolve(`/admin/users?${params.toString()}`);
	}

	function emailConfirmationLabel(status: string): string {
		return status === 'confirmed' ? 'Email confirmed' : 'Email pending';
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

	<WorkspaceToolbar
		ariaLabel="Users controls"
		items={[]}
		search={{
			label: 'Search',
			placeholder: 'Search by email...',
			value: search.value,
			onValueChange: search.setValue
		}}
		primary={{
			kind: 'action',
			id: 'access-requests',
			label: 'Open Access Requests',
			href: '/admin?kind=accessRequest'
		}}
	/>

	<Card.Root>
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
									<div class="flex flex-wrap items-center gap-2">
										<span class="font-mono text-xs text-muted-foreground">{user.id.slice(0, 8)}...</span>
										<Badge variant={user.emailConfirmationStatus === 'confirmed' ? 'success' : 'warning'}>
											{emailConfirmationLabel(user.emailConfirmationStatus)}
										</Badge>
									</div>
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
								<Button
									href="/admin/users/{user.id}"
									variant="outline"
									size="sm"
									aria-label={`Inspect ${user.email || user.id}`}>Inspect</Button
								>
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
		<Card.Footer class="text-sm text-muted-foreground">{data.users.length} shown</Card.Footer>
	</Card.Root>

	<AdminPager page={data.page} {totalPages} {pageHref} />
</PageShell.Root>
