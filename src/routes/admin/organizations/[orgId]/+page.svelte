<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import GiftTierModal from '$lib/components/admin/GiftTierModal.svelte';
	import SuspendModal from '$lib/components/admin/SuspendModal.svelte';
	import TransferOwnershipModal from '$lib/components/admin/TransferOwnershipModal.svelte';
	import {
		ADMIN_ROLE_COLORS,
		ADMIN_STATUS_COLORS,
		ADMIN_TIER_COLORS,
		formatAdminLabel
	} from '$lib/components/admin/adminTheme';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { formatDisplayDate, formatDisplayDateTime } from '$lib/utils/dates';

	let { data } = $props();

	const PERSONNEL_CAPS: Record<string, string> = {
		free: '20',
		team: '80',
		unit: '500'
	};

	let showSuspendModal = $state(false);
	let showTransferModal = $state(false);
	let showGiftModal = $state(false);

	async function handleSuspendComplete() {
		showSuspendModal = false;
		await invalidateAll();
	}

	async function handleTransferComplete() {
		showTransferModal = false;
		await invalidateAll();
	}

	async function handleGiftComplete() {
		showGiftModal = false;
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>{data.org.name} - Organizations - Admin - Troop to Task</title>
</svelte:head>

<div class="admin-page-shell">
	<header class="admin-page-header">
		<div class="admin-page-header__copy">
			<a href="/admin/organizations" class="back-link">Back to Organizations</a>
			<p class="admin-page-eyebrow">Organization Record</p>
			<h1 class="admin-page-title">{data.org.name}</h1>
			<p class="admin-page-subtitle">
				Created {formatDisplayDate(data.org.createdAt)} • {data.members.length} member{data.members.length === 1
					? ''
					: 's'} • {data.personnelCount} personnel
			</p>
		</div>
		<div class="admin-page-actions">
			<Badge
				label={formatAdminLabel(data.org.effectiveTier)}
				color={ADMIN_TIER_COLORS[data.org.effectiveTier] ?? 'var(--ink-35)'}
			/>
			{#if data.org.giftTier}<Badge label="Gifted" color={ADMIN_STATUS_COLORS.gifted} />{/if}
			<Badge
				label={data.org.isSuspended ? 'Suspended' : 'Active'}
				color={data.org.isSuspended ? ADMIN_STATUS_COLORS.suspended : ADMIN_STATUS_COLORS.active}
			/>
		</div>
	</header>

	<div class="action-strip">
		<button class="btn btn-secondary btn-sm" onclick={() => (showGiftModal = true)}>Gift Tier</button>
		<button class="btn btn-secondary btn-sm" onclick={() => (showTransferModal = true)}>Transfer Ownership</button>
		<button
			class="btn btn-sm {data.org.isSuspended ? 'btn-secondary' : 'btn-danger'}"
			onclick={() => (showSuspendModal = true)}
		>
			{data.org.isSuspended ? 'Unsuspend' : 'Suspend'}
		</button>
	</div>

	<div class="admin-overview-grid">
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Effective Tier</p>
			<p class="admin-overview-card__value">{formatAdminLabel(data.org.effectiveTier)}</p>
			<p class="admin-overview-card__meta">Base subscription plus any active gifted override.</p>
		</div>
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Personnel</p>
			<p class="admin-overview-card__value">{data.personnelCount}</p>
			<p class="admin-overview-card__meta">
				{data.personnelCount} of {PERSONNEL_CAPS[data.org.effectiveTier] ?? '?'} slots currently used.
			</p>
		</div>
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Gift Expires</p>
			<p class="admin-overview-card__value">
				{data.org.giftExpiresAt ? formatDisplayDate(data.org.giftExpiresAt) : 'None'}
			</p>
			<p class="admin-overview-card__meta">Current gifted plan expiry if one is active.</p>
		</div>
	</div>

	<div class="detail-grid">
		<section class="admin-panel">
			<div class="admin-panel__header">
				<div>
					<h2 class="admin-panel__title">Subscription</h2>
					<p class="admin-panel__meta">Plan and suspension state for this organization.</p>
				</div>
			</div>
			<dl class="detail-list">
				<div>
					<dt>Tier</dt>
					<dd>
						<Badge
							label={formatAdminLabel(data.org.effectiveTier)}
							color={ADMIN_TIER_COLORS[data.org.effectiveTier] ?? 'var(--ink-35)'}
						/>
					</dd>
				</div>
				<div>
					<dt>Base Tier</dt>
					<dd>{formatAdminLabel(data.org.subscriptionTier)}</dd>
				</div>
				<div>
					<dt>Personnel Count</dt>
					<dd>{data.personnelCount} / {PERSONNEL_CAPS[data.org.effectiveTier] ?? '?'}</dd>
				</div>
				<div>
					<dt>Member Since</dt>
					<dd>{formatDisplayDate(data.org.createdAt)}</dd>
				</div>
				{#if data.org.giftTier}
					<div>
						<dt>Gift Tier</dt>
						<dd>
							<Badge
								label={formatAdminLabel(data.org.giftTier)}
								color={ADMIN_TIER_COLORS[data.org.giftTier] ?? 'var(--ink-35)'}
							/>
						</dd>
					</div>
					<div>
						<dt>Gift Expires</dt>
						<dd>{data.org.giftExpiresAt ? formatDisplayDate(data.org.giftExpiresAt) : 'Never'}</dd>
					</div>
				{/if}
				{#if data.org.isSuspended}
					<div>
						<dt>Suspended At</dt>
						<dd class="text-error">{formatDisplayDateTime(data.org.suspendedAt)}</dd>
					</div>
				{/if}
			</dl>
		</section>

		<section class="admin-panel">
			<div class="admin-panel__header">
				<div>
					<h2 class="admin-panel__title">Members</h2>
					<p class="admin-panel__meta">Current membership roster for this organization.</p>
				</div>
			</div>
			<div class="member-stack">
				{#each data.members as member (member.userId)}
					<div class="member-row">
						<a href="/admin/users/{member.userId}" class="member-row__email">{member.email}</a>
						<Badge label={formatAdminLabel(member.role)} color={ADMIN_ROLE_COLORS[member.role] ?? 'var(--ink-35)'} />
					</div>
				{:else}
					<div class="admin-empty">No members found.</div>
				{/each}
			</div>
		</section>
	</div>

	<section class="admin-panel">
		<div class="admin-panel__header">
			<div>
				<h2 class="admin-panel__title">Recent Audit Events</h2>
				<p class="admin-panel__meta">Latest platform activity recorded against this organization.</p>
			</div>
		</div>
		<div class="admin-table-shell admin-table-shell--scroll embedded-table">
			<table class="admin-table">
				<thead>
					<tr>
						<th>Timestamp</th>
						<th>Action</th>
						<th>Resource</th>
						<th>Severity</th>
					</tr>
				</thead>
				<tbody>
					{#each data.auditEvents as evt (evt.id)}
						<tr>
							<td class="timestamp-cell">{formatDisplayDateTime(evt.timestamp)}</td>
							<td><span class="admin-code">{evt.action}</span></td>
							<td
								>{evt.resourceType ?? ''}{#if evt.resourceId}<span class="resource-id">
										• {evt.resourceId.slice(0, 8)}…</span
									>{/if}</td
							>
							<td
								><Badge
									label={formatAdminLabel(evt.severity)}
									color={ADMIN_STATUS_COLORS[evt.severity] ?? 'var(--ink-35)'}
								/></td
							>
						</tr>
					{:else}
						<tr><td colspan="4" class="admin-empty">No audit events recorded for this organization.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>

{#if showSuspendModal}
	<SuspendModal
		type="org"
		targetId={data.org.id}
		targetName={data.org.name}
		isSuspended={data.org.isSuspended}
		onClose={() => (showSuspendModal = false)}
		onComplete={handleSuspendComplete}
	/>
{/if}

{#if showTransferModal}
	<TransferOwnershipModal
		orgId={data.org.id}
		orgName={data.org.name}
		members={data.members}
		onClose={() => (showTransferModal = false)}
		onComplete={handleTransferComplete}
	/>
{/if}

{#if showGiftModal}
	<GiftTierModal
		orgId={data.org.id}
		orgName={data.org.name}
		currentGiftTier={data.org.giftTier}
		giftExpiresAt={data.org.giftExpiresAt}
		onClose={() => (showGiftModal = false)}
		onComplete={handleGiftComplete}
	/>
{/if}

<style>
	.back-link {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.action-strip {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.detail-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-4);
	}

	.detail-list,
	.member-stack {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.detail-list div,
	.member-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding-top: var(--sp-3);
		border-top: var(--border-rule);
	}

	.detail-list div:first-child,
	.member-row:first-child {
		padding-top: 0;
		border-top: none;
	}

	.detail-list dt {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.detail-list dd {
		margin: 0;
		text-align: right;
	}

	.member-row__email {
		font-size: var(--text-sm);
		font-weight: 600;
		word-break: break-word;
	}

	.embedded-table {
		border: none;
		border-radius: 0;
	}

	.timestamp-cell {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.resource-id {
		color: var(--text-tertiary);
	}

	@media (max-width: 800px) {
		.detail-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
