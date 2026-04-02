<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatDisplayDate, formatDisplayDateTime } from '$lib/utils/dates';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import SuspendModal from '$lib/components/admin/SuspendModal.svelte';
	import { ADMIN_STATUS_COLORS, ADMIN_TIER_COLORS, formatAdminLabel } from '$lib/components/admin/adminTheme';

	let { data, form } = $props();

	let showSuspendModal = $state(false);
	let sendingReset = $state(false);
	let sendingInvite = $state(false);
	let toastMessage = $state<string | null>(null);
	let toastError = $state<string | null>(null);

	function showToast(message: string, isError = false) {
		if (isError) {
			toastError = message;
			toastMessage = null;
		} else {
			toastMessage = message;
			toastError = null;
		}
		setTimeout(() => {
			toastMessage = null;
			toastError = null;
		}, 4000);
	}

	$effect(() => {
		if (form?.success && form?.message) showToast(form.message as string);
		else if (form && 'error' in form && form.error) showToast(form.error as string, true);
	});

	const initials = $derived(data.user.email.slice(0, 2).toUpperCase());
</script>

<svelte:head>
	<title>User Details - Admin - Troop to Task</title>
</svelte:head>

<div class="admin-page-shell admin-page-shell--compact">
	{#if toastMessage}<div class="admin-alert admin-alert--success">{toastMessage}</div>{/if}
	{#if toastError}<div class="admin-alert admin-alert--error">{toastError}</div>{/if}

	<header class="admin-page-header">
		<div class="admin-page-header__copy">
			<a href="/admin/users" class="back-link">Back to Users</a>
			<p class="admin-page-eyebrow">Identity Record</p>
			<h1 class="admin-page-title">{data.user.email}</h1>
			<p class="admin-page-subtitle">
				Joined {formatDisplayDate(data.user.createdAt)}
				{#if data.user.lastSignInAt}
					• Last sign-in {formatDisplayDateTime(data.user.lastSignInAt)}{:else}
					• Never signed in{/if}
			</p>
		</div>
		<div class="admin-page-actions">
			<div class="avatar-circle">{initials}</div>
			<Badge
				label={data.isSuspended ? 'Suspended' : 'Active'}
				color={data.isSuspended ? ADMIN_STATUS_COLORS.suspended : ADMIN_STATUS_COLORS.active}
			/>
		</div>
	</header>

	<div class="admin-overview-grid">
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">User ID</p>
			<p class="admin-overview-card__meta"><span class="admin-code">{data.user.id}</span></p>
		</div>
		<div class="admin-overview-card">
			<p class="admin-overview-card__label">Organizations</p>
			<p class="admin-overview-card__value">{data.organizations.length}</p>
			<p class="admin-overview-card__meta">Organizations where this account currently holds membership.</p>
		</div>
	</div>

	<div class="action-strip">
		<form
			method="POST"
			action="?/resetPassword"
			use:enhance={() => {
				sendingReset = true;
				return async ({ update }) => {
					await update();
					sendingReset = false;
				};
			}}
		>
			<button type="submit" class="btn btn-secondary" disabled={sendingReset}>
				{#if sendingReset}<Spinner color="currentColor" />{/if}
				Send Password Reset
			</button>
		</form>

		<form
			method="POST"
			action="?/resendInvite"
			use:enhance={() => {
				sendingInvite = true;
				return async ({ update }) => {
					await update();
					sendingInvite = false;
				};
			}}
		>
			<button type="submit" class="btn btn-secondary" disabled={sendingInvite}>
				{#if sendingInvite}<Spinner color="currentColor" />{/if}
				Resend Invite
			</button>
		</form>

		<button class="btn {data.isSuspended ? 'btn-secondary' : 'btn-danger'}" onclick={() => (showSuspendModal = true)}>
			{data.isSuspended ? 'Unsuspend User' : 'Suspend User'}
		</button>
	</div>

	<div class="detail-grid">
		<section class="admin-panel">
			<div class="admin-panel__header">
				<div>
					<h2 class="admin-panel__title">Organizations</h2>
					<p class="admin-panel__meta">Memberships and plan context for this account.</p>
				</div>
			</div>
			<div class="admin-table-shell admin-table-shell--scroll embedded-table">
				<table class="admin-table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Role</th>
							<th>Personnel</th>
							<th>Tier</th>
						</tr>
					</thead>
					<tbody>
						{#each data.organizations as org (org.id)}
							<tr>
								<td>
									{#if org.id}
										<a href="/admin/organizations/{org.id}" class="entity-link">{org.name}</a>
									{:else}
										{org.name}
									{/if}
								</td>
								<td><Badge label={formatAdminLabel(org.role)} color="var(--ink-35)" /></td>
								<td>{org.personnelCount}</td>
								<td
									><Badge
										label={formatAdminLabel(org.subscriptionTier)}
										color={ADMIN_TIER_COLORS[org.subscriptionTier] ?? 'var(--ink-35)'}
									/></td
								>
							</tr>
						{:else}
							<tr><td colspan="4" class="admin-empty">No organizations.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="admin-panel">
			<div class="admin-panel__header">
				<div>
					<h2 class="admin-panel__title">Recent Activity</h2>
					<p class="admin-panel__meta">Latest audit events tied to this identity.</p>
				</div>
			</div>
			<div class="admin-table-shell admin-table-shell--scroll embedded-table">
				<table class="admin-table">
					<thead>
						<tr>
							<th>Timestamp</th>
							<th>Action</th>
							<th>Resource</th>
							<th>Org</th>
						</tr>
					</thead>
					<tbody>
						{#each data.recentActivity as event (event.id)}
							<tr>
								<td class="timestamp-cell">{formatDisplayDateTime(event.timestamp)}</td>
								<td><span class="admin-code">{event.action}</span></td>
								<td class="text-muted"
									>{event.resourceType}{event.resourceId ? ` • ${event.resourceId.slice(0, 8)}…` : ''}</td
								>
								<td class="text-muted">{event.orgId ? `${event.orgId.slice(0, 8)}…` : '—'}</td>
							</tr>
						{:else}
							<tr><td colspan="4" class="admin-empty">No recent activity.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</div>
</div>

{#if showSuspendModal}
	<SuspendModal
		type="user"
		targetId={data.user.id}
		targetName={data.user.email}
		isSuspended={data.isSuspended}
		onClose={() => (showSuspendModal = false)}
		onComplete={() => {
			showSuspendModal = false;
			showToast(data.isSuspended ? 'User unsuspended' : 'User suspended');
		}}
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

	.avatar-circle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--amber-light) 74%, var(--surface-panel) 26%);
		border: 1px solid color-mix(in srgb, var(--amber-dark) 32%, var(--ink-15) 68%);
		font-family: var(--font-display);
		font-size: 1.55rem;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.action-strip,
	.detail-grid {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.detail-grid {
		display: grid;
		grid-template-columns: 1fr;
	}

	.embedded-table {
		border: none;
		border-radius: 0;
	}

	.entity-link {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.timestamp-cell {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}
</style>
