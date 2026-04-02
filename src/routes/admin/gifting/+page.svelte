<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { ADMIN_STATUS_COLORS, ADMIN_TIER_COLORS, formatAdminLabel } from '$lib/components/admin/adminTheme';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { formatDisplayDateTime } from '$lib/utils/dates';

	let { data, form } = $props();

	let searchInput = $state('');
	let loadingId = $state<string | null>(null);
	let giftingOrgId = $state<string | null>(null);
	let extendingOrgId = $state<string | null>(null);
	let giftTier = $state<'team' | 'unit'>('team');
	let giftDays = $state(30);
	let extendDays = $state(30);

	$effect(() => {
		searchInput = data.search;
	});

	function applySearch() {
		const params = new URLSearchParams();
		if (searchInput) params.set('search', searchInput);
		goto(`/admin/gifting?${params.toString()}`);
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

<div class="admin-page-shell">
	<header class="admin-page-header">
		<div class="admin-page-header__copy">
			<p class="admin-page-eyebrow">Plan Overrides</p>
			<h1 class="admin-page-title">Organization Gifting</h1>
			<p class="admin-page-subtitle">
				Apply temporary paid access, extend an existing gift, or revoke an override without leaving the platform admin
				workspace.
			</p>
		</div>
	</header>

	<div class="admin-overview-grid">
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Tracked Orgs</p>
			<p class="admin-overview-card__value">{data.organizations.length}</p>
			<p class="admin-overview-card__meta">Organizations currently returned by the gifting search.</p>
		</div>
	</div>

	{#if form?.error}
		<div class="admin-alert admin-alert--error">{form.error}</div>
	{/if}

	{#if form?.success}
		<div class="admin-alert admin-alert--success">
			{#if form.action === 'gift'}
				Gift applied successfully.
			{:else if form.action === 'revoke'}
				Gift revoked successfully.
			{:else if form.action === 'extend'}
				Gift extended successfully.
			{/if}
		</div>
	{/if}

	<div class="admin-toolbar">
		<form
			class="admin-toolbar__group"
			onsubmit={(event) => {
				event.preventDefault();
				applySearch();
			}}
		>
			<div class="admin-toolbar__field admin-toolbar__field--search">
				<label class="label" for="gifting-search">Search</label>
				<input
					id="gifting-search"
					type="text"
					placeholder="Search by org name or owner email..."
					bind:value={searchInput}
					class="input"
				/>
			</div>
			<button type="submit" class="btn btn-secondary">Apply</button>
		</form>
	</div>

	<div class="admin-table-shell admin-table-shell--scroll">
		<table class="admin-table gifting-table">
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
						<td>
							<div class="entity-cell">
								<strong>{org.name}</strong>
								<span class="admin-code">{org.id.slice(0, 8)}...</span>
							</div>
						</td>
						<td class="owner-cell">{org.ownerEmail}</td>
						<td>
							<div class="tier-cell">
								<Badge label={formatAdminLabel(org.tier)} color={ADMIN_TIER_COLORS[org.tier] ?? 'var(--ink-35)'} />
								{#if org.hasActiveSubscription}<Badge label="Stripe" color="var(--info)" />{/if}
							</div>
						</td>
						<td>{org.personnelCount}</td>
						<td>
							{#if isGiftActive(org)}
								<div class="gift-cell">
									<Badge label={`Gift: ${formatAdminLabel(org.giftTier ?? '')}`} color={ADMIN_STATUS_COLORS.gifted} />
									<span class="text-muted">Expires {formatDisplayDateTime(org.giftExpiresAt)}</span>
								</div>
							{:else if isGiftExpired(org)}
								<div class="gift-cell">
									<Badge label="Expired" color={ADMIN_STATUS_COLORS.expired} />
									<span class="text-muted">Was {formatAdminLabel(org.giftTier ?? '')}</span>
								</div>
							{:else}
								<span class="text-muted">No gift</span>
							{/if}
						</td>
						<td class="actions-cell">
							{#if giftingOrgId === org.id}
								<form
									method="POST"
									action="?/giftTier"
									class="inline-form"
									use:enhance={() => {
										loadingId = `${org.id}-gift`;
										return async ({ update }) => {
											loadingId = null;
											giftingOrgId = null;
											await update();
										};
									}}
								>
									<input type="hidden" name="orgId" value={org.id} />
									<select name="giftTier" bind:value={giftTier} class="select">
										<option value="team">Team</option>
										<option value="unit">Unit</option>
									</select>
									<input
										type="number"
										name="days"
										bind:value={giftDays}
										min="1"
										max="365"
										class="input days-input"
										placeholder="Days"
									/>
									<button type="submit" class="btn btn-primary btn-sm" disabled={loadingId !== null}>
										{#if loadingId === `${org.id}-gift`}<Spinner />{/if}
										Apply
									</button>
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => (giftingOrgId = null)}
										>Cancel</button
									>
								</form>
							{:else if extendingOrgId === org.id}
								<form
									method="POST"
									action="?/extendGift"
									class="inline-form"
									use:enhance={() => {
										loadingId = `${org.id}-extend`;
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
										class="input days-input"
										placeholder="Days"
									/>
									<button type="submit" class="btn btn-primary btn-sm" disabled={loadingId !== null}>
										{#if loadingId === `${org.id}-extend`}<Spinner />{/if}
										Extend
									</button>
									<button type="button" class="btn btn-secondary btn-sm" onclick={() => (extendingOrgId = null)}
										>Cancel</button
									>
								</form>
							{:else}
								<div class="action-buttons">
									<button
										class="btn btn-primary btn-sm"
										onclick={() => {
											giftingOrgId = org.id;
											extendingOrgId = null;
										}}
									>
										Gift
									</button>
									{#if isGiftActive(org)}
										<button
											class="btn btn-secondary btn-sm"
											onclick={() => {
												extendingOrgId = org.id;
												giftingOrgId = null;
											}}
										>
											Extend
										</button>
										<form
											method="POST"
											action="?/revokeGift"
											use:enhance={() => {
												loadingId = `${org.id}-revoke`;
												return async ({ update }) => {
													loadingId = null;
													await update();
												};
											}}
										>
											<input type="hidden" name="orgId" value={org.id} />
											<button type="submit" class="btn btn-danger btn-sm" disabled={loadingId !== null}>
												{#if loadingId === `${org.id}-revoke`}<Spinner />{/if}
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
						<td colspan="6" class="admin-empty">No organizations found.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.entity-cell,
	.gift-cell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.owner-cell {
		max-width: 220px;
		word-break: break-word;
		color: var(--text-secondary);
	}

	.tier-cell,
	.action-buttons,
	.inline-form {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.days-input {
		width: 92px;
	}

	.actions-cell {
		min-width: 260px;
	}
</style>
