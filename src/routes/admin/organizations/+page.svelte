<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { ADMIN_STATUS_COLORS, ADMIN_TIER_COLORS, formatAdminLabel } from '$lib/components/admin/adminTheme';

	let { data } = $props();

	let searchInput = $state('');
	let tierFilter = $state('all');
	let statusFilter = $state('all');

	const filteredOrgs = $derived.by(() => {
		let result = data.organizations;

		if (searchInput.trim()) {
			const q = searchInput.trim().toLowerCase();
			result = result.filter((org) => org.name.toLowerCase().includes(q) || org.ownerEmail.toLowerCase().includes(q));
		}

		if (tierFilter !== 'all') result = result.filter((org) => org.effectiveTier === tierFilter);
		if (statusFilter === 'active') result = result.filter((org) => !org.isSuspended);
		if (statusFilter === 'suspended') result = result.filter((org) => org.isSuspended);

		return result;
	});
</script>

<svelte:head>
	<title>Organizations - Admin - Troop to Task</title>
</svelte:head>

<div class="admin-page-shell">
	<header class="admin-page-header">
		<div class="admin-page-header__copy">
			<p class="admin-page-eyebrow">Organization Ledger</p>
			<h1 class="admin-page-title">Organizations</h1>
			<p class="admin-page-subtitle">
				Review organization health, ownership, plan state, and suspension status from the central platform index.
			</p>
		</div>
	</header>

	<div class="admin-overview-grid">
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Total Organizations</p>
			<p class="admin-overview-card__value">{data.organizations.length}</p>
			<p class="admin-overview-card__meta">Every organization currently attached to the platform.</p>
		</div>
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Filtered View</p>
			<p class="admin-overview-card__value">{filteredOrgs.length}</p>
			<p class="admin-overview-card__meta">Organizations matching the current search and plan filters.</p>
		</div>
	</div>

	<div class="admin-toolbar">
		<div class="admin-toolbar__group">
			<div class="admin-toolbar__field admin-toolbar__field--search">
				<label class="label" for="org-search">Search</label>
				<input
					id="org-search"
					class="input"
					type="text"
					placeholder="Search by name or owner email..."
					bind:value={searchInput}
				/>
			</div>
			<div class="admin-toolbar__field">
				<label class="label" for="tier-filter">Tier</label>
				<select id="tier-filter" bind:value={tierFilter} class="select">
					<option value="all">All tiers</option>
					<option value="free">Free</option>
					<option value="team">Team</option>
					<option value="unit">Unit</option>
				</select>
			</div>
			<div class="admin-toolbar__field">
				<label class="label" for="status-filter">Status</label>
				<select id="status-filter" bind:value={statusFilter} class="select">
					<option value="all">All statuses</option>
					<option value="active">Active</option>
					<option value="suspended">Suspended</option>
				</select>
			</div>
		</div>
		<div class="admin-toolbar__meta">
			<span>{filteredOrgs.length} matched</span>
		</div>
	</div>

	<div class="admin-table-shell admin-table-shell--scroll">
		<table class="admin-table orgs-table">
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
						<td>
							<div class="entity-cell">
								<a href="/admin/organizations/{org.id}" class="entity-link">{org.name}</a>
								<span class="admin-code">{org.id.slice(0, 8)}...</span>
							</div>
						</td>
						<td>
							<div class="tier-cell">
								<Badge
									label={formatAdminLabel(org.effectiveTier)}
									color={ADMIN_TIER_COLORS[org.effectiveTier] ?? 'var(--ink-35)'}
								/>
								{#if org.gift_tier}
									<Badge label="Gift" color={ADMIN_STATUS_COLORS.gifted} />
								{/if}
							</div>
						</td>
						<td>{org.memberCount}</td>
						<td>{org.personnelCount}</td>
						<td class="owner-cell">{org.ownerEmail || '—'}</td>
						<td>
							<Badge
								label={org.isSuspended ? 'Suspended' : 'Active'}
								color={org.isSuspended ? ADMIN_STATUS_COLORS.suspended : ADMIN_STATUS_COLORS.active}
							/>
						</td>
						<td>{formatDisplayDate(org.created_at)}</td>
					</tr>
				{:else}
					<tr>
						<td colspan="7" class="admin-empty">No organizations found.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.entity-cell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.entity-link {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.tier-cell {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.owner-cell {
		max-width: 240px;
		word-break: break-word;
		color: var(--text-secondary);
	}
</style>
