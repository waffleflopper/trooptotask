<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import PlatformInviteManager from '$features/groups/components/PlatformInviteManager.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { ADMIN_STATUS_COLORS } from '$lib/components/admin/adminTheme';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let { data } = $props();
	let showPlatformInvite = $state(false);
	let searchInput = $derived(data.search);

	function applyFilters() {
		const params = new SvelteURLSearchParams();
		if (searchInput) params.set('search', searchInput);
		params.set('page', '1');
		goto(`/admin/users?${params.toString()}`);
	}

	function goToPage(pageNum: number) {
		const params = new SvelteURLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`/admin/users?${params.toString()}`);
	}

	const totalPages = $derived(Math.ceil(data.totalCount / data.limit));
</script>

<svelte:head>
	<title>Users - Admin - Troop to Task</title>
</svelte:head>

<div class="admin-page-shell">
	<header class="admin-page-header">
		<div class="admin-page-header__copy">
			<p class="admin-page-eyebrow">Identity Ledger</p>
			<h1 class="admin-page-title">Users</h1>
			<p class="admin-page-subtitle">Search, inspect, and manage platform identities across every organization.</p>
		</div>
		<div class="admin-page-actions">
			<button class="btn btn-primary" onclick={() => (showPlatformInvite = true)}>Invite User</button>
		</div>
	</header>

	<div class="admin-overview-grid">
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Directory Size</p>
			<p class="admin-overview-card__value">{data.totalCount}</p>
			<p class="admin-overview-card__meta">Total user accounts currently indexed by the platform.</p>
		</div>
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Page</p>
			<p class="admin-overview-card__value">{data.page}</p>
			<p class="admin-overview-card__meta">
				Reviewing page {data.page} of {Math.max(totalPages, 1)} in the user ledger.
			</p>
		</div>
	</div>

	{#if data.authError}
		<div class="admin-alert admin-alert--error"><strong>Failed to load users:</strong> {data.authError}</div>
	{/if}

	<div class="admin-toolbar">
		<form
			class="admin-toolbar__group"
			onsubmit={(event) => {
				event.preventDefault();
				applyFilters();
			}}
		>
			<div class="admin-toolbar__field admin-toolbar__field--search">
				<label class="label" for="users-search">Search</label>
				<input id="users-search" type="text" placeholder="Search by email..." bind:value={searchInput} class="input" />
			</div>
			<button type="submit" class="btn btn-secondary">Apply</button>
		</form>
		<div class="admin-toolbar__meta">
			<span>{data.users.length} shown</span>
		</div>
	</div>

	<div class="admin-table-shell admin-table-shell--scroll">
		<table class="admin-table users-table">
			<thead>
				<tr>
					<th>User</th>
					<th>Organizations</th>
					<th>Joined</th>
					<th>Status</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as user (user.id)}
					<tr>
						<td>
							<div class="entity-cell">
								<strong>{user.email || 'No email'}</strong>
								<span class="admin-code">{user.id.slice(0, 8)}...</span>
							</div>
						</td>
						<td>{user.organizationCount}</td>
						<td>{formatDisplayDate(user.createdAt)}</td>
						<td>
							<Badge
								label={user.isSuspended ? 'Suspended' : 'Active'}
								color={user.isSuspended ? ADMIN_STATUS_COLORS.suspended : ADMIN_STATUS_COLORS.active}
							/>
						</td>
						<td class="actions-cell">
							<a href="/admin/users/{user.id}" class="btn btn-secondary btn-sm">Inspect</a>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="5" class="admin-empty">No users found.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if totalPages > 1}
		<div class="pagination-row">
			<button class="btn btn-secondary btn-sm" disabled={data.page <= 1} onclick={() => goToPage(data.page - 1)}
				>Previous</button
			>
			<span>Page {data.page} of {totalPages}</span>
			<button
				class="btn btn-secondary btn-sm"
				disabled={data.page >= totalPages}
				onclick={() => goToPage(data.page + 1)}>Next</button
			>
		</div>
	{/if}
</div>

{#if showPlatformInvite}
	<PlatformInviteManager onClose={() => (showPlatformInvite = false)} />
{/if}

<style>
	.entity-cell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.entity-cell strong {
		font-size: var(--text-sm);
	}

	.actions-cell {
		width: 1%;
		white-space: nowrap;
	}

	.pagination-row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--sp-3);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}
</style>
