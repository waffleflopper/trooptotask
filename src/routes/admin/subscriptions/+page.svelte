<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';

	let { data } = $props();

	let searchInput = $state('');
	let tierFilter = $state('all');
	let statusFilter = $state('all');
	let currentPage = $state(1);

	const PAGE_SIZE = 20;

	const TIER_COLORS: Record<string, string> = {
		free: '#888888',
		team: '#3f51b5',
		unit: '#7c4dff'
	};

	const filteredSubs = $derived.by(() => {
		let result = data.subscriptions;

		if (searchInput.trim()) {
			const q = searchInput.trim().toLowerCase();
			result = result.filter((s) => s.name.toLowerCase().includes(q) || s.ownerEmail.toLowerCase().includes(q));
		}

		if (tierFilter !== 'all') {
			result = result.filter((s) => s.effectiveTier === tierFilter);
		}

		if (statusFilter === 'active') {
			result = result.filter((s) => !s.isSuspended && !s.isGifted);
		} else if (statusFilter === 'suspended') {
			result = result.filter((s) => s.isSuspended);
		} else if (statusFilter === 'gifted') {
			result = result.filter((s) => s.isGifted);
		}

		return result;
	});

	const totalPages = $derived(Math.max(1, Math.ceil(filteredSubs.length / PAGE_SIZE)));

	const pagedSubs = $derived.by(() => {
		const start = (currentPage - 1) * PAGE_SIZE;
		return filteredSubs.slice(start, start + PAGE_SIZE);
	});

	// Reset to page 1 when filters change
	$effect(() => {
		// Read reactive dependencies
		searchInput;
		tierFilter;
		statusFilter;
		currentPage = 1;
	});

	function formatPersonnelCap(count: number, cap: number | null): string {
		if (cap === null) return `${count} / ∞`;
		return `${count} / ${cap}`;
	}

	function isOverCap(count: number, cap: number | null): boolean {
		if (cap === null) return false;
		return count > cap;
	}
</script>

<svelte:head>
	<title>Subscriptions - Admin - Troop to Task</title>
</svelte:head>

<div class="subs-page">
	<header class="page-header">
		<div>
			<h1>Subscriptions</h1>
			<p class="subtitle">{data.subscriptions.length} total organizations</p>
		</div>
	</header>

	<!-- Filters -->
	<div class="filters">
		<input type="text" placeholder="Search by name or owner email..." bind:value={searchInput} class="search-input" />

		<select bind:value={tierFilter} class="select filter-select">
			<option value="all">All tiers</option>
			<option value="free">Free</option>
			<option value="team">Team</option>
			<option value="unit">Unit</option>
		</select>

		<select bind:value={statusFilter} class="select filter-select">
			<option value="all">All statuses</option>
			<option value="active">Active</option>
			<option value="suspended">Suspended</option>
			<option value="gifted">Gifted</option>
		</select>
	</div>

	<!-- Table -->
	<div class="table-container">
		<table class="subs-table">
			<thead>
				<tr>
					<th>Organization</th>
					<th>Tier</th>
					<th>Status</th>
					<th>Personnel</th>
					<th>Owner</th>
					<th>Gift</th>
					<th>Created</th>
				</tr>
			</thead>
			<tbody>
				{#each pagedSubs as sub (sub.id)}
					<tr>
						<td class="name-cell">
							<a href="/admin/organizations/{sub.id}" class="org-link">{sub.name}</a>
							<code class="org-id">{sub.id.slice(0, 8)}...</code>
						</td>
						<td>
							<Badge
								label={sub.effectiveTier.charAt(0).toUpperCase() + sub.effectiveTier.slice(1)}
								color={TIER_COLORS[sub.effectiveTier] ?? '#888888'}
							/>
						</td>
						<td>
							{#if sub.isSuspended}
								<Badge label="Suspended" color="#dc2626" />
							{:else}
								<Badge label="Active" color="#16a34a" />
							{/if}
						</td>
						<td class:over-cap={isOverCap(sub.personnelCount, sub.personnelCap)}>
							{formatPersonnelCap(sub.personnelCount, sub.personnelCap)}
						</td>
						<td class="owner-cell">{sub.ownerEmail || '—'}</td>
						<td>
							{#if sub.isGifted}
								<span class="gift-info">
									<Badge label="Gifted" color="#f59e0b" textColor="#000" />
									{#if sub.gift_expires_at}
										<span class="gift-expiry">until {formatDisplayDate(sub.gift_expires_at)}</span>
									{/if}
								</span>
							{:else}
								<span class="text-muted">—</span>
							{/if}
						</td>
						<td>{formatDisplayDate(sub.created_at)}</td>
					</tr>
				{:else}
					<tr>
						<td colspan="7" class="empty-state">No subscriptions found</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Pagination + summary -->
	{#if filteredSubs.length > 0}
		<div class="table-footer">
			<p class="filter-summary">
				Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredSubs.length)}–{Math.min(
					currentPage * PAGE_SIZE,
					filteredSubs.length
				)} of {filteredSubs.length}
				{filteredSubs.length !== data.subscriptions.length ? `(filtered from ${data.subscriptions.length})` : ''}
			</p>
			{#if totalPages > 1}
				<div class="pagination">
					<button
						class="btn btn-sm btn-secondary"
						onclick={() => (currentPage = Math.max(1, currentPage - 1))}
						disabled={currentPage === 1}
					>
						Previous
					</button>
					<span class="page-info">Page {currentPage} of {totalPages}</span>
					<button
						class="btn btn-sm btn-secondary"
						onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
						disabled={currentPage === totalPages}
					>
						Next
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.subs-page {
		max-width: 1200px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
	}

	.page-header h1 {
		font-size: var(--font-size-2xl, 24px);
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: var(--spacing-xs);
	}

	.subtitle {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin: 0;
	}

	/* Filters */
	.filters {
		display: flex;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
		margin-bottom: var(--spacing-lg);
	}

	.search-input {
		flex: 1;
		min-width: 220px;
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

	.filter-select {
		min-width: 140px;
	}

	/* Table */
	.table-container {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow-x: auto;
	}

	.subs-table {
		width: 100%;
		border-collapse: collapse;
	}

	.subs-table th,
	.subs-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		text-align: left;
		border-bottom: 1px solid var(--color-border);
	}

	.subs-table th {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		background: var(--color-surface-variant);
	}

	.subs-table td {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		vertical-align: middle;
	}

	.subs-table tbody tr:last-child td {
		border-bottom: none;
	}

	.subs-table tbody tr:hover {
		background: var(--color-surface-variant);
	}

	.name-cell {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.org-link {
		font-weight: 500;
		color: var(--color-primary);
		text-decoration: none;
	}

	.org-link:hover {
		text-decoration: underline;
	}

	.org-id {
		font-size: var(--font-size-xs);
		padding: 2px 6px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		width: fit-content;
	}

	.owner-cell {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.over-cap {
		color: var(--color-error);
		font-weight: 600;
	}

	.gift-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.gift-expiry {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.text-muted {
		color: var(--color-text-muted);
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-xl) !important;
	}

	/* Footer */
	.table-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--spacing-md);
		margin-top: var(--spacing-md);
	}

	.filter-summary {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin: 0;
	}

	.pagination {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.page-info {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}
</style>
