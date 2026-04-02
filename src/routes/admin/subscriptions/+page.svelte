<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { ADMIN_STATUS_COLORS, ADMIN_TIER_COLORS, formatAdminLabel } from '$lib/components/admin/adminTheme';

	let { data } = $props();

	let searchInput = $state('');
	let tierFilter = $state('all');
	let statusFilter = $state('all');
	let currentPage = $state(1);

	const PAGE_SIZE = 20;

	const filteredSubs = $derived.by(() => {
		let result = data.subscriptions;

		if (searchInput.trim()) {
			const q = searchInput.trim().toLowerCase();
			result = result.filter((sub) => sub.name.toLowerCase().includes(q) || sub.ownerEmail.toLowerCase().includes(q));
		}

		if (tierFilter !== 'all') result = result.filter((sub) => sub.effectiveTier === tierFilter);
		if (statusFilter === 'active') result = result.filter((sub) => !sub.isSuspended && !sub.isGifted);
		if (statusFilter === 'suspended') result = result.filter((sub) => sub.isSuspended);
		if (statusFilter === 'gifted') result = result.filter((sub) => sub.isGifted);

		return result;
	});

	const totalPages = $derived(Math.max(1, Math.ceil(filteredSubs.length / PAGE_SIZE)));
	const pagedSubs = $derived.by(() => {
		const start = (currentPage - 1) * PAGE_SIZE;
		return filteredSubs.slice(start, start + PAGE_SIZE);
	});

	$effect(() => {
		searchInput;
		tierFilter;
		statusFilter;
		currentPage = 1;
	});

	function formatPersonnelCap(count: number, cap: number | null): string {
		return cap === null ? `${count} / ∞` : `${count} / ${cap}`;
	}

	function isOverCap(count: number, cap: number | null): boolean {
		return cap !== null && count > cap;
	}
</script>

<svelte:head>
	<title>Subscriptions - Admin - Troop to Task</title>
</svelte:head>

<div class="admin-page-shell">
	<header class="admin-page-header">
		<div class="admin-page-header__copy">
			<p class="admin-page-eyebrow">Billing Ledger</p>
			<h1 class="admin-page-title">Subscriptions</h1>
			<p class="admin-page-subtitle">
				Inspect plan state, gifted access, personnel caps, and billing-related organization status in one ledger.
			</p>
		</div>
	</header>

	<div class="admin-overview-grid">
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Tracked Orgs</p>
			<p class="admin-overview-card__value">{data.subscriptions.length}</p>
			<p class="admin-overview-card__meta">Organizations currently represented in the subscription dataset.</p>
		</div>
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Filtered</p>
			<p class="admin-overview-card__value">{filteredSubs.length}</p>
			<p class="admin-overview-card__meta">Organizations matching the current billing filters.</p>
		</div>
	</div>

	<div class="admin-toolbar">
		<div class="admin-toolbar__group">
			<div class="admin-toolbar__field admin-toolbar__field--search">
				<label class="label" for="subscription-search">Search</label>
				<input
					id="subscription-search"
					class="input"
					type="text"
					placeholder="Search by org or owner..."
					bind:value={searchInput}
				/>
			</div>
			<div class="admin-toolbar__field">
				<label class="label" for="subscription-tier">Tier</label>
				<select id="subscription-tier" bind:value={tierFilter} class="select">
					<option value="all">All tiers</option>
					<option value="free">Free</option>
					<option value="team">Team</option>
					<option value="unit">Unit</option>
				</select>
			</div>
			<div class="admin-toolbar__field">
				<label class="label" for="subscription-status">Status</label>
				<select id="subscription-status" bind:value={statusFilter} class="select">
					<option value="all">All statuses</option>
					<option value="active">Active</option>
					<option value="suspended">Suspended</option>
					<option value="gifted">Gifted</option>
				</select>
			</div>
		</div>
		<div class="admin-toolbar__meta">
			<span>{pagedSubs.length} on page</span>
		</div>
	</div>

	<div class="admin-table-shell admin-table-shell--scroll">
		<table class="admin-table">
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
						<td>
							<div class="entity-cell">
								<a href="/admin/organizations/{sub.id}" class="entity-link">{sub.name}</a>
								<span class="admin-code">{sub.id.slice(0, 8)}...</span>
							</div>
						</td>
						<td>
							<Badge
								label={formatAdminLabel(sub.effectiveTier)}
								color={ADMIN_TIER_COLORS[sub.effectiveTier] ?? 'var(--ink-35)'}
							/>
						</td>
						<td>
							<Badge
								label={sub.isSuspended ? 'Suspended' : 'Active'}
								color={sub.isSuspended ? ADMIN_STATUS_COLORS.suspended : ADMIN_STATUS_COLORS.active}
							/>
						</td>
						<td class:over-cap={isOverCap(sub.personnelCount, sub.personnelCap)}
							>{formatPersonnelCap(sub.personnelCount, sub.personnelCap)}</td
						>
						<td class="owner-cell">{sub.ownerEmail || '—'}</td>
						<td>
							{#if sub.isGifted}
								<div class="gift-cell">
									<Badge label="Gifted" color={ADMIN_STATUS_COLORS.gifted} />
									{#if sub.gift_expires_at}
										<span class="text-muted">until {formatDisplayDate(sub.gift_expires_at)}</span>
									{/if}
								</div>
							{:else}
								<span class="text-muted">—</span>
							{/if}
						</td>
						<td>{formatDisplayDate(sub.created_at)}</td>
					</tr>
				{:else}
					<tr>
						<td colspan="7" class="admin-empty">No subscriptions found.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if filteredSubs.length > 0}
		<div class="pagination-row">
			<p>
				Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredSubs.length)}–{Math.min(
					currentPage * PAGE_SIZE,
					filteredSubs.length
				)}
				of {filteredSubs.length}
			</p>
			{#if totalPages > 1}
				<div class="pagination-row__controls">
					<button
						class="btn btn-secondary btn-sm"
						onclick={() => (currentPage = Math.max(1, currentPage - 1))}
						disabled={currentPage === 1}>Previous</button
					>
					<span>Page {currentPage} of {totalPages}</span>
					<button
						class="btn btn-secondary btn-sm"
						onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
						disabled={currentPage === totalPages}>Next</button
					>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.entity-cell,
	.gift-cell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.entity-link {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.owner-cell {
		max-width: 240px;
		word-break: break-word;
		color: var(--text-secondary);
	}

	.over-cap {
		color: var(--danger);
		font-weight: 600;
	}

	.pagination-row,
	.pagination-row__controls {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.pagination-row {
		justify-content: space-between;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.pagination-row p {
		margin: 0;
	}
</style>
