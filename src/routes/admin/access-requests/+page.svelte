<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Spinner } from '$lib/components/ui/spinner';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import { adminBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';

	let { data, form } = $props();
	let activeTab = $state<'pending' | 'reviewed'>('pending');
	let loadingId = $state<string | null>(null);
</script>

<svelte:head>
	<title>Access Requests - Admin - Troop to Task</title>
</svelte:head>

<div class="admin-page-shell admin-page-shell--compact">
	<header class="admin-page-header">
		<div class="admin-page-header__copy">
			<p class="admin-page-eyebrow">Trust Queue</p>
			<h1 class="admin-page-title">Access Requests</h1>
			<p class="admin-page-subtitle">Review inbound requests from potential users before they enter the platform.</p>
		</div>
	</header>

	<div class="admin-overview-grid">
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Pending</p>
			<p class="admin-overview-card__value">{data.pending.length}</p>
			<p class="admin-overview-card__meta">Requests waiting for approval or rejection.</p>
		</div>
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Reviewed</p>
			<p class="admin-overview-card__value">{data.reviewed.length}</p>
			<p class="admin-overview-card__meta">Requests already processed and logged.</p>
		</div>
	</div>

	{#if form?.error}
		<div class="admin-alert admin-alert--error">{form.error}</div>
	{/if}

	<div class="admin-segmented" aria-label="Access request tabs">
		<button class:active={activeTab === 'pending'} onclick={() => (activeTab = 'pending')}>
			Pending
			{#if data.pending.length > 0}<span>{data.pending.length}</span>{/if}
		</button>
		<button class:active={activeTab === 'reviewed'} onclick={() => (activeTab = 'reviewed')}>
			Reviewed
			{#if data.reviewed.length > 0}<span>{data.reviewed.length}</span>{/if}
		</button>
	</div>

	{#if activeTab === 'pending'}
		{#if data.pending.length === 0}
			<div class="admin-panel"><div class="admin-empty">No pending requests.</div></div>
		{:else}
			<div class="request-stack">
				{#each data.pending as req (req.id)}
					<section class="admin-panel request-card">
						<div class="request-card__main">
							<p class="request-card__name">{req.name}</p>
							<p class="request-card__email">{req.email}</p>
							{#if req.reason}<p class="request-card__reason">{req.reason}</p>{/if}
							<p class="request-card__meta">Submitted {formatDisplayDateTime(req.created_at)}</p>
						</div>
						<div class="request-card__actions">
							<form
								method="POST"
								action="?/approve"
								use:enhance={() => {
									loadingId = `${req.id}-approve`;
									return async ({ update }) => {
										loadingId = null;
										await update();
									};
								}}
							>
								<input type="hidden" name="requestId" value={req.id} />
								<Button type="submit" disabled={loadingId !== null}>
									{#if loadingId === `${req.id}-approve`}<Spinner />{/if}
									Approve
								</Button>
							</form>
							<form
								method="POST"
								action="?/reject"
								use:enhance={() => {
									loadingId = `${req.id}-reject`;
									return async ({ update }) => {
										loadingId = null;
										await update();
									};
								}}
							>
								<input type="hidden" name="requestId" value={req.id} />
								<Button type="submit" variant="destructive" disabled={loadingId !== null}>
									{#if loadingId === `${req.id}-reject`}<Spinner />{/if}
									Reject
								</Button>
							</form>
						</div>
					</section>
				{/each}
			</div>
		{/if}
	{:else if data.reviewed.length === 0}
		<div class="admin-panel"><div class="admin-empty">No reviewed requests yet.</div></div>
	{:else}
		<div class="request-stack">
			{#each data.reviewed as req (req.id)}
				<section class="admin-panel request-card">
					<div class="request-card__main">
						<div class="request-card__row">
							<p class="request-card__name">{req.name}</p>
							<Badge variant={adminBadgeVariant(req.status)}>{formatAdminLabel(req.status)}</Badge>
						</div>
						<p class="request-card__email">{req.email}</p>
						{#if req.reason}<p class="request-card__reason">{req.reason}</p>{/if}
						<p class="request-card__meta">
							Submitted {formatDisplayDateTime(req.created_at)}
							{#if req.reviewed_at}
								• Reviewed {formatDisplayDateTime(req.reviewed_at)}{/if}
						</p>
					</div>
					{#if req.status === 'approved' && !req.registration_invites?.used_at}
						<div class="request-card__actions">
							<form
								method="POST"
								action="?/resend"
								use:enhance={() => {
									loadingId = `${req.id}-resend`;
									return async ({ update }) => {
										loadingId = null;
										await update();
									};
								}}
							>
								<input type="hidden" name="requestId" value={req.id} />
								<Button type="submit" variant="outline" disabled={loadingId !== null}>
									{#if loadingId === `${req.id}-resend`}<Spinner color="currentColor" />{/if}
									Resend Invite
								</Button>
							</form>
						</div>
					{:else if req.status === 'approved' && req.registration_invites?.used_at}
						<p class="request-card__meta">
							Account setup completed {formatDisplayDateTime(req.registration_invites.used_at)}
						</p>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</div>

<style>
	.request-stack {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.request-card {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-4);
		flex-wrap: wrap;
	}

	.request-card__main {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		min-width: 0;
		flex: 1;
	}

	.request-card__row {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.request-card__name,
	.request-card__email,
	.request-card__reason,
	.request-card__meta {
		margin: 0;
	}

	.request-card__name {
		font-family: var(--font-display);
		font-size: 1.55rem;
		line-height: 0.96;
		text-transform: uppercase;
	}

	.request-card__email {
		color: var(--text-secondary);
	}

	.request-card__reason {
		line-height: 1.6;
	}

	.request-card__meta {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.request-card__actions {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
</style>
