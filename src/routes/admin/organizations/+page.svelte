<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';

	let { data } = $props();

	let searchInput = $state('');
	let tierFilter = $state('all');
	let statusFilter = $state('all');

	const TIER_COLORS: Record<string, string> = {
		free: '#6b7280',
		team: '#3f51b5',
		unit: '#7c3aed'
	};

	const filteredOrgs = $derived.by(() => {
		let result = data.organizations;

		if (searchInput.trim()) {
			const q = searchInput.trim().toLowerCase();
			result = result.filter(
				(o) => o.name.toLowerCase().includes(q) || o.ownerEmail.toLowerCase().includes(q)
			);
		}

		if (tierFilter !== 'all') {
			result = result.filter((o) => o.effectiveTier === tierFilter);
		}

		if (statusFilter === 'active') {
			result = result.filter((o) => !o.isSuspended);
		} else if (statusFilter === 'suspended') {
			result = result.filter((o) => o.isSuspended);
		}

		return result;
	});
</script>

<svelte:head>
	<title>Organizations - Admin - Troop to Task</title>
</svelte:head>

<div class="orgs-page">
	<header class="page-header">
		<div>
			<h1>Organizations</h1>
			<p class="subtitle">{data.organizations.length} total organizations</p>
		</div>
	</header>

	<!-- Filters -->
	<div class="filters">
		<input
			type="text"
			placeholder="Search by name or owner email..."
			bind:value={searchInput}
			class="search-input"
		/>

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
		</select>
	</div>

	<!-- Table -->
	<div class="table-container">
		<table class="orgs-table">
			<thead>
				<tr>
					<th>Name</th>
					<th>Tier</th>
					<th>Members</th>
					<th>Personnel</th>
					<th>Owner</th>
					<th>Status</th>
					<th>Created</th>
				</tr>
			</thead>
			<tbody>
				{#each filteredOrgs as org (org.id)}
					<tr>
						<td class="name-cell">
							<a href="/admin/organizations/{org.id}" class="org-link">{org.name}</a>
							<code class="org-id">{org.id.slice(0, 8)}...</code>
						</td>
						<td>
							<Badge
								label={org.effectiveTier.charAt(0).toUpperCase() + org.effectiveTier.slice(1)}
								color={TIER_COLORS[org.effectiveTier] ?? '#6b7280'}
							/>
							{#if org.gift_tier}
								<span class="gift-indicator" title="Gifted tier">🎁</span>
							{/if}
						</td>
						<td>{org.memberCount}</td>
						<td>{org.personnelCount}</td>
						<td class="owner-cell">{org.ownerEmail || '—'}</td>
						<td>
							{#if org.isSuspended}
								<Badge label="Suspended" color="#dc2626" />
							{:else}
								<Badge label="Active" color="#16a34a" />
							{/if}
						</td>
						<td>{formatDisplayDate(org.created_at)}</td>
					</tr>
				{:else}
					<tr>
						<td colspan="7" class="empty-state">No organizations found</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if filteredOrgs.length !== data.organizations.length}
		<p class="filter-summary">
			Showing {filteredOrgs.length} of {data.organizations.length} organizations
		</p>
	{/if}
</div>

<style>
	.orgs-page {
		max-width: 1200px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
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
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-lg);
		align-items: center;
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

	.orgs-table {
		width: 100%;
		border-collapse: collapse;
	}

	.orgs-table th,
	.orgs-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		text-align: left;
		border-bottom: 1px solid var(--color-border);
	}

	.orgs-table th {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		background: var(--color-surface-variant);
	}

	.orgs-table td {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		vertical-align: middle;
	}

	.orgs-table tbody tr:last-child td {
		border-bottom: none;
	}

	.orgs-table tbody tr:hover {
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

	.gift-indicator {
		margin-left: var(--spacing-xs);
		font-size: var(--font-size-sm);
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-xl) !important;
	}

	.filter-summary {
		margin-top: var(--spacing-md);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		text-align: right;
	}
</style>
