<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import SuspendModal from '$lib/components/admin/SuspendModal.svelte';
	import TransferOwnershipModal from '$lib/components/admin/TransferOwnershipModal.svelte';
	import { formatDisplayDate, formatDisplayDateTime } from '$lib/utils/dates';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	const TIER_COLORS: Record<string, string> = {
		free: '#6b7280',
		team: '#3f51b5',
		unit: '#7c4dff'
	};

	const PERSONNEL_CAPS: Record<string, string> = {
		free: '15',
		team: '80',
		unit: 'Unlimited'
	};

	let showSuspendModal = $state(false);
	let showTransferModal = $state(false);

	function tierLabel(tier: string) {
		return tier.charAt(0).toUpperCase() + tier.slice(1);
	}

	async function handleSuspendComplete() {
		showSuspendModal = false;
		await invalidateAll();
	}

	async function handleTransferComplete() {
		showTransferModal = false;
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>{data.org.name} - Organizations - Admin - Troop to Task</title>
</svelte:head>

<div class="detail-page">
	<!-- Back link -->
	<a href="/admin/organizations" class="back-link">← Back to Organizations</a>

	<!-- Header -->
	<header class="page-header">
		<div class="header-main">
			<div>
				<h1>{data.org.name}</h1>
				<p class="subtitle">
					Created {formatDisplayDate(data.org.createdAt)} &middot;
					{data.members.length} member{data.members.length === 1 ? '' : 's'} &middot;
					{data.personnelCount} personnel
				</p>
			</div>
			<div class="header-badges">
				<Badge
					label={tierLabel(data.org.effectiveTier)}
					color={TIER_COLORS[data.org.effectiveTier] ?? '#6b7280'}
				/>
				{#if data.org.giftTier}
					<Badge label="Gifted" color="#f59e0b" textColor="#1f2937" />
				{/if}
				{#if data.org.isSuspended}
					<Badge label="Suspended" color="#dc2626" />
				{:else}
					<Badge label="Active" color="#16a34a" />
				{/if}
			</div>
		</div>

		<!-- Quick Actions -->
		<div class="actions-bar">
			<a href="/admin/gifting?orgId={data.org.id}" class="btn btn-secondary btn-sm">Gift Tier</a>
			<button class="btn btn-secondary btn-sm" onclick={() => (showTransferModal = true)}>
				Transfer Ownership
			</button>
			<button
				class="btn btn-sm {data.org.isSuspended ? 'btn-primary' : 'btn-danger'}"
				onclick={() => (showSuspendModal = true)}
			>
				{data.org.isSuspended ? 'Unsuspend' : 'Suspend'}
			</button>
		</div>
	</header>

	<div class="content-grid">
		<!-- Subscription Card -->
		<section class="card">
			<h2 class="card-title">Subscription</h2>
			<dl class="info-grid">
				<div class="info-row">
					<dt>Tier</dt>
					<dd>
						<Badge
							label={tierLabel(data.org.effectiveTier)}
							color={TIER_COLORS[data.org.effectiveTier] ?? '#6b7280'}
						/>
					</dd>
				</div>
				<div class="info-row">
					<dt>Base Tier</dt>
					<dd>{tierLabel(data.org.subscriptionTier)}</dd>
				</div>
				<div class="info-row">
					<dt>Personnel Count</dt>
					<dd>{data.personnelCount} / {PERSONNEL_CAPS[data.org.effectiveTier] ?? '?'}</dd>
				</div>
				<div class="info-row">
					<dt>Member Since</dt>
					<dd>{formatDisplayDate(data.org.createdAt)}</dd>
				</div>
				{#if data.org.giftTier}
					<div class="info-row">
						<dt>Gift Tier</dt>
						<dd>
							<Badge label={tierLabel(data.org.giftTier)} color={TIER_COLORS[data.org.giftTier] ?? '#6b7280'} />
						</dd>
					</div>
					<div class="info-row">
						<dt>Gift Expires</dt>
						<dd>{data.org.giftExpiresAt ? formatDisplayDate(data.org.giftExpiresAt) : 'Never'}</dd>
					</div>
				{/if}
				{#if data.org.isSuspended}
					<div class="info-row">
						<dt>Suspended At</dt>
						<dd class="text-error">{formatDisplayDateTime(data.org.suspendedAt)}</dd>
					</div>
				{/if}
			</dl>
		</section>

		<!-- Members Card -->
		<section class="card">
			<h2 class="card-title">Members ({data.members.length})</h2>
			{#if data.members.length === 0}
				<p class="empty-note">No members found.</p>
			{:else}
				<ul class="member-list">
					{#each data.members as member (member.userId)}
						<li class="member-row">
							<div class="member-info">
								<a href="/admin/users/{member.userId}" class="member-email">{member.email}</a>
							</div>
							<Badge
								label={member.role.charAt(0).toUpperCase() + member.role.slice(1)}
								color={member.role === 'owner' ? '#7c3aed' : member.role === 'admin' ? '#3f51b5' : '#6b7280'}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Audit Log Card -->
		<section class="card full-width">
			<h2 class="card-title">Recent Audit Events</h2>
			{#if data.auditEvents.length === 0}
				<p class="empty-note">No audit events recorded for this organization.</p>
			{:else}
				<table class="audit-table">
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
								<td class="ts-cell">{formatDisplayDateTime(evt.timestamp)}</td>
								<td><code class="action-code">{evt.action}</code></td>
								<td class="resource-cell">
									{evt.resourceType ?? ''}
									{#if evt.resourceId}
										<span class="resource-id">{evt.resourceId.slice(0, 8)}…</span>
									{/if}
								</td>
								<td>
									<Badge
										label={evt.severity}
										color={evt.severity === 'critical' ? '#dc2626' : evt.severity === 'warning' ? '#f59e0b' : '#6b7280'}
									/>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	</div>
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

<style>
	.detail-page {
		max-width: 1100px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.back-link {
		color: var(--color-primary);
		text-decoration: none;
		font-size: var(--font-size-sm);
		font-weight: 500;
	}

	.back-link:hover {
		text-decoration: underline;
	}

	/* Header */
	.page-header {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.header-main {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
		flex-wrap: wrap;
	}

	.page-header h1 {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 var(--spacing-xs);
	}

	.subtitle {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		margin: 0;
	}

	.header-badges {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
	}

	.actions-bar {
		display: flex;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	/* Grid layout */
	.content-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-lg);
	}

	.full-width {
		grid-column: 1 / -1;
	}

	/* Cards */
	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.card-title {
		font-size: var(--font-size-base);
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 var(--spacing-md);
	}

	/* Info grid (dl) */
	.info-grid {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.info-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
	}

	.info-row dt {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.info-row dd {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		margin: 0;
		text-align: right;
	}

	.text-error {
		color: var(--color-error);
	}

	/* Members */
	.member-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.member-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.member-row:last-child {
		border-bottom: none;
	}

	.member-info {
		min-width: 0;
		flex: 1;
	}

	.member-email {
		font-size: var(--font-size-sm);
		color: var(--color-primary);
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
	}

	.member-email:hover {
		text-decoration: underline;
	}

	.empty-note {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin: 0;
	}

	/* Audit table */
	.audit-table {
		width: 100%;
		border-collapse: collapse;
	}

	.audit-table th,
	.audit-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		text-align: left;
		border-bottom: 1px solid var(--color-border);
	}

	.audit-table th {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		background: var(--color-surface-variant);
	}

	.audit-table td {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		vertical-align: middle;
	}

	.audit-table tbody tr:last-child td {
		border-bottom: none;
	}

	.ts-cell {
		white-space: nowrap;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	.action-code {
		font-size: var(--font-size-xs);
		padding: 2px 6px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-sm);
		color: var(--color-text);
	}

	.resource-cell {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-sm);
	}

	.resource-id {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		font-family: monospace;
	}

	@media (max-width: 768px) {
		.content-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
