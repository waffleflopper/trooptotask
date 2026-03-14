<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatDisplayDate, formatDisplayDateTime } from '$lib/utils/dates';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import SuspendModal from '$lib/components/admin/SuspendModal.svelte';

	let { data, form } = $props();

	let showSuspendModal = $state(false);
	let sendingReset = $state(false);
	let sendingInvite = $state(false);
	let toastMessage = $state<string | null>(null);
	let toastError = $state<string | null>(null);

	function showToast(msg: string, isError = false) {
		if (isError) {
			toastError = msg;
			toastMessage = null;
		} else {
			toastMessage = msg;
			toastError = null;
		}
		setTimeout(() => {
			toastMessage = null;
			toastError = null;
		}, 4000);
	}

	$effect(() => {
		if (form?.success && form?.message) {
			showToast(form.message as string);
		} else if (form && 'error' in form && form.error) {
			showToast(form.error as string, true);
		}
	});

	const initials = $derived(
		data.user.email.slice(0, 2).toUpperCase()
	);

	const tierColor: Record<string, string> = {
		free: '#6b7280',
		team: '#3b82f6',
		unit: '#8b5cf6'
	};
</script>

<svelte:head>
	<title>User Details - Admin - Troop to Task</title>
</svelte:head>

{#if toastMessage}
	<div class="toast toast-success">{toastMessage}</div>
{/if}
{#if toastError}
	<div class="toast toast-error">{toastError}</div>
{/if}

<div class="user-detail-page">
	<header class="page-header">
		<a href="/admin/users" class="back-link">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M19 12H5M12 19l-7-7 7-7"/>
			</svg>
			Back to Users
		</a>

		<div class="user-header">
			<div class="avatar-circle">{initials}</div>
			<div class="user-meta">
				<div class="user-email-row">
					<h1>{data.user.email}</h1>
					{#if data.isSuspended}
						<Badge label="SUSPENDED" color="#dc2626" />
					{:else}
						<Badge label="ACTIVE" color="#16a34a" />
					{/if}
				</div>
				<div class="user-timestamps">
					<span>Joined {formatDisplayDate(data.user.createdAt)}</span>
					{#if data.user.lastSignInAt}
						<span class="separator">·</span>
						<span>Last sign-in {formatDisplayDateTime(data.user.lastSignInAt)}</span>
					{:else}
						<span class="separator">·</span>
						<span class="text-muted">Never signed in</span>
					{/if}
				</div>
				<code class="user-id-code">{data.user.id}</code>
			</div>
		</div>
	</header>

	<!-- Quick Actions -->
	<div class="actions-bar">
		<form method="POST" action="?/resetPassword" use:enhance={() => {
			sendingReset = true;
			return async ({ update }) => {
				await update();
				sendingReset = false;
			};
		}}>
			<button type="submit" class="btn btn-secondary" disabled={sendingReset}>
				{#if sendingReset}<Spinner color="currentColor" />{/if}
				Send Password Reset
			</button>
		</form>

		<form method="POST" action="?/resendInvite" use:enhance={() => {
			sendingInvite = true;
			return async ({ update }) => {
				await update();
				sendingInvite = false;
			};
		}}>
			<button type="submit" class="btn btn-secondary" disabled={sendingInvite}>
				{#if sendingInvite}<Spinner color="currentColor" />{/if}
				Resend Invite
			</button>
		</form>

		<button
			class="btn {data.isSuspended ? 'btn-secondary' : 'btn-danger'}"
			onclick={() => (showSuspendModal = true)}
		>
			{data.isSuspended ? 'Unsuspend User' : 'Suspend User'}
		</button>
	</div>

	<div class="content-grid">
		<!-- Organizations -->
		<section class="card">
			<h2>Organizations ({data.organizations.length})</h2>
			{#if data.organizations.length > 0}
				<table class="inner-table">
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
										<a href="/admin/organizations/{org.id}" class="org-link">{org.name}</a>
									{:else}
										{org.name}
									{/if}
								</td>
								<td class="capitalize">{org.role}</td>
								<td>{org.personnelCount}</td>
								<td>
									<Badge
										label={org.subscriptionTier.toUpperCase()}
										color={tierColor[org.subscriptionTier] ?? '#6b7280'}
									/>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="empty-state">No organizations</p>
			{/if}
		</section>

		<!-- Recent Activity -->
		<section class="card">
			<h2>Recent Activity</h2>
			{#if data.recentActivity.length > 0}
				<table class="inner-table">
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
								<td class="nowrap">{formatDisplayDateTime(event.timestamp)}</td>
								<td><code class="action-code">{event.action}</code></td>
								<td class="text-muted">{event.resourceType}{event.resourceId ? ` · ${event.resourceId.slice(0, 8)}…` : ''}</td>
								<td class="text-muted">{event.orgId ? event.orgId.slice(0, 8) + '…' : '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="empty-state">No recent activity</p>
			{/if}
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
	.user-detail-page {
		max-width: 1000px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.back-link:hover {
		color: var(--color-primary);
	}

	.user-header {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-md);
	}

	.avatar-circle {
		width: 56px;
		height: 56px;
		min-width: 56px;
		border-radius: 50%;
		background: var(--color-primary);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--font-size-lg);
		font-weight: 700;
		letter-spacing: 0.05em;
	}

	.user-meta {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.user-email-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.user-email-row h1 {
		font-size: var(--font-size-lg);
		font-weight: 700;
		color: var(--color-text);
	}

	.user-timestamps {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.separator {
		color: var(--color-border);
	}

	.user-id-code {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		background: var(--color-surface-variant);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		width: fit-content;
	}

	/* Actions Bar */
	.actions-bar {
		display: flex;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
		margin-bottom: var(--spacing-lg);
	}

	.actions-bar .btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	/* Content Grid */
	.content-grid {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.card h2 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-md);
	}

	/* Inner Table */
	.inner-table {
		width: 100%;
		border-collapse: collapse;
	}

	.inner-table th,
	.inner-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		text-align: left;
		border-bottom: 1px solid var(--color-border);
		font-size: var(--font-size-sm);
	}

	.inner-table th {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		background: var(--color-surface-variant);
	}

	.inner-table tbody tr:last-child td {
		border-bottom: none;
	}

	.org-link {
		color: var(--color-primary);
		text-decoration: none;
		font-weight: 500;
	}

	.org-link:hover {
		text-decoration: underline;
	}

	.capitalize {
		text-transform: capitalize;
	}

	.text-muted {
		color: var(--color-text-muted);
	}

	.nowrap {
		white-space: nowrap;
	}

	.action-code {
		font-size: var(--font-size-xs);
		background: var(--color-surface-variant);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-lg);
	}

	/* Toast */
	.toast {
		position: fixed;
		bottom: var(--spacing-lg);
		right: var(--spacing-lg);
		z-index: 9999;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		font-weight: 500;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.toast-success {
		background: var(--color-success);
		color: white;
	}

	.toast-error {
		background: var(--color-error);
		color: white;
	}
</style>
