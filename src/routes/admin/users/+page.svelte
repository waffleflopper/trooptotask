<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import PlatformInviteManager from '$lib/components/PlatformInviteManager.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';

	let { data } = $props();
	let showPlatformInvite = $state(false);

	let searchInput = $state(data.search);

	function applyFilters() {
		const params = new URLSearchParams();
		if (searchInput) params.set('search', searchInput);
		params.set('page', '1');
		goto(`/admin/users?${params.toString()}`);
	}

	function goToPage(pageNum: number) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`/admin/users?${params.toString()}`);
	}

	const totalPages = $derived(Math.ceil(data.totalCount / data.limit));
</script>

<svelte:head>
	<title>Users - Admin - Troop to Task</title>
</svelte:head>

<div class="users-page">
	<header class="page-header">
		<div class="header-content">
			<div>
				<h1>Users</h1>
				<p class="subtitle">{data.totalCount} total users</p>
			</div>
			<button class="btn btn-primary" onclick={() => (showPlatformInvite = true)}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
					<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
					<circle cx="8.5" cy="7" r="4" />
					<line x1="20" y1="8" x2="20" y2="14" />
					<line x1="23" y1="11" x2="17" y2="11" />
				</svg>
				Invite User
			</button>
		</div>
	</header>

	<!-- Filters -->
	<div class="filters">
		<form class="search-form" onsubmit={(e) => { e.preventDefault(); applyFilters(); }}>
			<input
				type="text"
				placeholder="Search by email..."
				bind:value={searchInput}
				class="search-input"
			/>
			<button type="submit" class="search-btn">Search</button>
		</form>
	</div>

	<!-- Users Table -->
	<div class="users-table-container">
		<table class="users-table">
			<thead>
				<tr>
					<th>User</th>
					<th>Organizations</th>
					<th>Joined</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as user (user.id)}
					<tr>
						<td class="user-cell">
							<span class="user-email">{user.email || 'No email'}</span>
							<code class="user-id">{user.id.slice(0, 8)}...</code>
						</td>
						<td>{user.organizationCount}</td>
						<td>{formatDisplayDate(user.createdAt)}</td>
						<td>
							<a href="/admin/users/{user.id}" class="view-btn">View</a>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="4" class="empty-state">No users found</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Pagination -->
	{#if totalPages > 1}
		<div class="pagination">
			<button
				class="page-btn"
				disabled={data.page <= 1}
				onclick={() => goToPage(data.page - 1)}
			>
				Previous
			</button>

			<span class="page-info">
				Page {data.page} of {totalPages}
			</span>

			<button
				class="page-btn"
				disabled={data.page >= totalPages}
				onclick={() => goToPage(data.page + 1)}
			>
				Next
			</button>
		</div>
	{/if}
</div>

{#if showPlatformInvite}
	<PlatformInviteManager onClose={() => (showPlatformInvite = false)} />
{/if}

<style>
	.users-page {
		max-width: 1200px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--spacing-md);
	}

	.header-content .btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.page-header h1 {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: var(--spacing-xs);
	}

	.subtitle {
		color: var(--color-text-muted);
	}

	/* Filters */
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
	}

	.search-form {
		display: flex;
		flex: 1;
		min-width: 250px;
		gap: var(--spacing-sm);
	}

	.search-input {
		flex: 1;
		padding: var(--spacing-sm) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: var(--font-size-sm);
	}

	.search-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.search-btn {
		padding: var(--spacing-sm) var(--spacing-lg);
		background: var(--color-primary);
		color: #0F0F0F;
		border: none;
		border-radius: var(--radius-md);
		font-weight: 500;
		cursor: pointer;
	}

	.search-btn:hover {
		background: var(--color-primary-hover);
	}

	/* Table */
	.users-table-container {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow-x: auto;
	}

	.users-table {
		width: 100%;
		border-collapse: collapse;
	}

	.users-table th,
	.users-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		text-align: left;
		border-bottom: 1px solid var(--color-border);
	}

	.users-table th {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		background: var(--color-surface-variant);
	}

	.users-table td {
		font-size: var(--font-size-sm);
		color: var(--color-text);
	}

	.users-table tbody tr:hover {
		background: var(--color-surface-variant);
	}

	.user-cell {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.user-email {
		font-weight: 500;
	}

	.user-id {
		font-size: var(--font-size-xs);
		padding: 2px 6px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		width: fit-content;
	}

	.view-btn {
		font-size: var(--font-size-sm);
		color: var(--color-primary);
		text-decoration: none;
	}

	.view-btn:hover {
		text-decoration: underline;
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-xl) !important;
	}

	/* Pagination */
	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: var(--spacing-md);
		margin-top: var(--spacing-lg);
	}

	.page-btn {
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		cursor: pointer;
	}

	.page-btn:hover:not(:disabled) {
		background: var(--color-surface-variant);
	}

	.page-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.page-info {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}
</style>
