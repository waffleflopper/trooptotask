<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { formatDisplayDateTime } from '$lib/utils/dates';

	let { data, form } = $props();

	let searchInput = $state(data.search);
	let loadingId = $state<string | null>(null);
	let giftingOrgId = $state<string | null>(null);
	let extendingOrgId = $state<string | null>(null);
	let giftTier = $state<'team' | 'unit'>('team');
	let giftDays = $state(30);
	let extendDays = $state(30);

	function applySearch() {
		const params = new URLSearchParams();
		if (searchInput) params.set('search', searchInput);
		goto(`/admin/gifting?${params.toString()}`);
	}

	function tierColor(tier: string): string {
		switch (tier) {
			case 'unit':
				return 'var(--color-primary)';
			case 'team':
				return 'var(--color-success)';
			default:
				return 'var(--color-text-muted)';
		}
	}

	function isGiftActive(org: (typeof data.organizations)[0]): boolean {
		return !!org.giftTier && !!org.giftExpiresAt && new Date(org.giftExpiresAt) > new Date();
	}

	function isGiftExpired(org: (typeof data.organizations)[0]): boolean {
		return !!org.giftTier && !!org.giftExpiresAt && new Date(org.giftExpiresAt) <= new Date();
	}
</script>

<svelte:head>
	<title>Gifting - Admin - Troop to Task</title>
</svelte:head>

<div class="gifting-page">
	<header class="page-header">
		<div>
			<h1>Org Gifting</h1>
			<p class="subtitle">Gift subscription tiers to organizations</p>
		</div>
	</header>

	{#if form?.error}
		<div class="alert alert-error">{form.error}</div>
	{/if}

	{#if form?.success}
		<div class="alert alert-success">
			{#if form.action === 'gift'}
				Gift applied successfully.
			{:else if form.action === 'revoke'}
				Gift revoked successfully.
			{:else if form.action === 'extend'}
				Gift extended successfully.
			{/if}
		</div>
	{/if}

	<!-- Search -->
	<div class="filters">
		<form class="search-form" onsubmit={(e) => { e.preventDefault(); applySearch(); }}>
			<input
				type="text"
				placeholder="Search by org name or owner email..."
				bind:value={searchInput}
				class="search-input"
			/>
			<button type="submit" class="search-btn">Search</button>
		</form>
	</div>

	<!-- Orgs Table -->
	<div class="table-container">
		<table class="orgs-table">
			<thead>
				<tr>
					<th>Organization</th>
					<th>Owner</th>
					<th>Tier</th>
					<th>Personnel</th>
					<th>Gift Status</th>
					<th>Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each data.organizations as org (org.id)}
					<tr>
						<td class="org-cell">
							<span class="org-name">{org.name}</span>
							<code class="org-id">{org.id.slice(0, 8)}...</code>
						</td>
						<td class="owner-cell">{org.ownerEmail}</td>
						<td>
							<Badge label={org.tier} color={tierColor(org.tier)} bold />
							{#if org.hasActiveSubscription}
								<Badge label="Stripe" color="var(--color-info)" />
							{/if}
						</td>
						<td>{org.personnelCount}</td>
						<td>
							{#if isGiftActive(org)}
								<div class="gift-info">
									<Badge label="Gift: {org.giftTier}" color="var(--color-warning)" />
									<span class="gift-expiry">
										Expires {formatDisplayDateTime(org.giftExpiresAt)}
									</span>
								</div>
							{:else if isGiftExpired(org)}
								<div class="gift-info">
									<Badge label="Expired" color="var(--color-error)" />
									<span class="gift-expiry">
										Was: {org.giftTier}
									</span>
								</div>
							{:else}
								<span class="no-gift">No gift</span>
							{/if}
						</td>
						<td class="actions-cell">
							{#if giftingOrgId === org.id}
								<!-- Gift form inline -->
								<form
									method="POST"
									action="?/giftTier"
									class="inline-form"
									use:enhance={() => {
										loadingId = org.id + '-gift';
										return async ({ update }) => {
											loadingId = null;
											giftingOrgId = null;
											await update();
										};
									}}
								>
									<input type="hidden" name="orgId" value={org.id} />
									<select name="giftTier" bind:value={giftTier} class="select select-sm">
										<option value="team">Team</option>
										<option value="unit">Unit</option>
									</select>
									<input
										type="number"
										name="days"
										bind:value={giftDays}
										min="1"
										max="365"
										class="input input-sm days-input"
										placeholder="Days"
									/>
									<button type="submit" class="btn btn-primary btn-sm" disabled={loadingId !== null}>
										{#if loadingId === org.id + '-gift'}
											<span class="spinner"></span>
										{/if}
										Apply
									</button>
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => (giftingOrgId = null)}>
										Cancel
									</button>
								</form>
							{:else if extendingOrgId === org.id}
								<!-- Extend form inline -->
								<form
									method="POST"
									action="?/extendGift"
									class="inline-form"
									use:enhance={() => {
										loadingId = org.id + '-extend';
										return async ({ update }) => {
											loadingId = null;
											extendingOrgId = null;
											await update();
										};
									}}
								>
									<input type="hidden" name="orgId" value={org.id} />
									<input
										type="number"
										name="days"
										bind:value={extendDays}
										min="1"
										max="365"
										class="input input-sm days-input"
										placeholder="Days"
									/>
									<button type="submit" class="btn btn-primary btn-sm" disabled={loadingId !== null}>
										{#if loadingId === org.id + '-extend'}
											<span class="spinner"></span>
										{/if}
										Extend
									</button>
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => (extendingOrgId = null)}>
										Cancel
									</button>
								</form>
							{:else}
								<div class="action-buttons">
									<button
										class="btn btn-primary btn-sm"
										onclick={() => { giftingOrgId = org.id; extendingOrgId = null; }}
									>
										Gift
									</button>
									{#if isGiftActive(org)}
										<button
											class="btn btn-secondary btn-sm"
											onclick={() => { extendingOrgId = org.id; giftingOrgId = null; }}
										>
											Extend
										</button>
										<form
											method="POST"
											action="?/revokeGift"
											class="inline"
											use:enhance={() => {
												loadingId = org.id + '-revoke';
												return async ({ update }) => {
													loadingId = null;
													await update();
												};
											}}
										>
											<input type="hidden" name="orgId" value={org.id} />
											<button type="submit" class="btn btn-danger btn-sm" disabled={loadingId !== null}>
												{#if loadingId === org.id + '-revoke'}
													<span class="spinner"></span>
												{/if}
												Revoke
											</button>
										</form>
									{/if}
								</div>
							{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="6" class="empty-state">No organizations found</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.gifting-page {
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

	/* Alerts */
	.alert {
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.alert-error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
	}

	.alert-success {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: #16a34a;
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
		color: #0f0f0f;
		border: none;
		border-radius: var(--radius-md);
		font-weight: 500;
		cursor: pointer;
	}

	.search-btn:hover {
		background: var(--color-primary-hover);
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
		white-space: nowrap;
	}

	.orgs-table td {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		vertical-align: middle;
	}

	.orgs-table tbody tr:hover {
		background: var(--color-surface-variant);
	}

	.org-cell {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.org-name {
		font-weight: 500;
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
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Gift status */
	.gift-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.gift-expiry {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.no-gift {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	/* Actions */
	.actions-cell {
		min-width: 200px;
	}

	.action-buttons {
		display: flex;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
	}

	.inline-form {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
	}

	.inline {
		display: inline;
	}

	.select-sm {
		padding: 4px 8px;
		font-size: var(--font-size-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
	}

	.input-sm {
		padding: 4px 8px;
		font-size: var(--font-size-sm);
	}

	.days-input {
		width: 70px;
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-xl) !important;
	}

	.spinner {
		display: inline-block;
		width: 12px;
		height: 12px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		border-top-color: white;
		animation: spin 0.8s linear infinite;
		margin-right: 4px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	:global([data-theme='dark']) .alert-error {
		background: #450a0a;
		border-color: #7f1d1d;
		color: #fca5a5;
	}

	:global([data-theme='dark']) .alert-success {
		background: #052e16;
		border-color: #14532d;
		color: #86efac;
	}

	@media (max-width: 768px) {
		.orgs-table th:nth-child(2),
		.orgs-table td:nth-child(2) {
			display: none;
		}

		.actions-cell {
			min-width: 150px;
		}
	}
</style>
