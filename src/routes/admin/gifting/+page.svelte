<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { adminBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';
	import { Badge } from '$lib/components/ui/badge';
	import { Spinner } from '$lib/components/ui/spinner';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let { data, form } = $props();

	let searchInput = $derived(data.search);
	let loadingId = $state<string | null>(null);
	let giftingOrgId = $state<string | null>(null);
	let extendingOrgId = $state<string | null>(null);
	let giftTier = $state<'team' | 'unit'>('team');
	let giftDays = $state(30);
	let extendDays = $state(30);

	function applySearch() {
		const params = new SvelteURLSearchParams();
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
				<Label for="gifting-search">Search</Label>
				<Input
					id="gifting-search"
					type="text"
					placeholder="Search by org name or owner email..."
					bind:value={searchInput}
				/>
			</div>
			<Button type="submit" variant="outline">Apply</Button>
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
								<Badge variant={adminBadgeVariant(org.tier)}>{formatAdminLabel(org.tier)}</Badge>
								{#if org.hasActiveSubscription}<Badge variant="info">Stripe</Badge>{/if}
							</div>
						</td>
						<td>{org.personnelCount}</td>
						<td>
							{#if isGiftActive(org)}
								<div class="gift-cell">
									<Badge variant="warning">Gift: {formatAdminLabel(org.giftTier ?? '')}</Badge>
									<span class="text-muted">Expires {formatDisplayDateTime(org.giftExpiresAt)}</span>
								</div>
							{:else if isGiftExpired(org)}
								<div class="gift-cell">
									<Badge variant="secondary">Expired</Badge>
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
									<NativeSelect name="giftTier" bind:value={giftTier}>
										<option value="team">Team</option>
										<option value="unit">Unit</option>
									</NativeSelect>
									<Input
										type="number"
										name="days"
										bind:value={giftDays}
										min="1"
										max="365"
										class="w-[92px]"
										placeholder="Days"
									/>
									<Button type="submit" disabled={loadingId !== null}>
										{#if loadingId === `${org.id}-gift`}<Spinner />{/if}
										Apply
									</Button>
									<Button type="button" variant="outline" onclick={() => (giftingOrgId = null)}>Cancel</Button>
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
									<Input
										type="number"
										name="days"
										bind:value={extendDays}
										min="1"
										max="365"
										class="w-[92px]"
										placeholder="Days"
									/>
									<Button type="submit" disabled={loadingId !== null}>
										{#if loadingId === `${org.id}-extend`}<Spinner />{/if}
										Extend
									</Button>
									<Button type="button" variant="outline" onclick={() => (extendingOrgId = null)}>Cancel</Button>
								</form>
							{:else}
								<div class="action-buttons">
									<Button
										onclick={() => {
											giftingOrgId = org.id;
											extendingOrgId = null;
										}}
									>
										Gift
									</Button>
									{#if isGiftActive(org)}
										<Button
											variant="outline"
											onclick={() => {
												extendingOrgId = org.id;
												giftingOrgId = null;
											}}
										>
											Extend
										</Button>
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
											<Button type="submit" variant="destructive" disabled={loadingId !== null}>
												{#if loadingId === `${org.id}-revoke`}<Spinner />{/if}
												Revoke
											</Button>
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

	.actions-cell {
		min-width: 260px;
	}
</style>
