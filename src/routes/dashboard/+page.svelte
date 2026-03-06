<script lang="ts">
	import { enhance } from '$app/forms';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { formatRelativeDate } from '$lib/utils/dates';

	let { data, form } = $props();
	let loading = $state<string | null>(null);
</script>

<svelte:head>
	<title>Dashboard - Troop to Task</title>
</svelte:head>

<div class="selector-page">
	<button class="theme-toggle" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
		{#if themeStore.isDark}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="5"/>
				<line x1="12" y1="1" x2="12" y2="3"/>
				<line x1="12" y1="21" x2="12" y2="23"/>
				<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
				<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
				<line x1="1" y1="12" x2="3" y2="12"/>
				<line x1="21" y1="12" x2="23" y2="12"/>
				<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
				<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
			</svg>
		{/if}
	</button>
	<div class="selector-card">
		<h1>Troop to Task</h1>
		<p class="subtitle">Select an organization to manage</p>

		{#if form?.error}
			<div class="error-message">{form.error}</div>
		{/if}

		{#if data.pendingInvitations.length > 0}
			<div class="invitations-section">
				<h2>Pending Invitations</h2>
				<div class="invitation-list">
					{#each data.pendingInvitations as invitation (invitation.id)}
						<div class="invitation-item">
							<div class="invitation-info">
								<span class="invitation-org">{invitation.organizationName}</span>
								<span class="invitation-meta">Invited {formatRelativeDate(invitation.createdAt)}</span>
							</div>
							<div class="invitation-actions">
								<form
									method="POST"
									action="?/acceptInvitation"
									use:enhance={() => {
										loading = invitation.id;
										return async ({ update }) => {
											loading = null;
											await update();
										};
									}}
								>
									<input type="hidden" name="invitationId" value={invitation.id} />
									<button type="submit" class="btn btn-primary btn-sm" disabled={loading === invitation.id}>
										{loading === invitation.id ? 'Accepting...' : 'Accept'}
									</button>
								</form>
								<form
									method="POST"
									action="?/declineInvitation"
									use:enhance={() => {
										loading = invitation.id;
										return async ({ update }) => {
											loading = null;
											await update();
										};
									}}
								>
									<input type="hidden" name="invitationId" value={invitation.id} />
									<button type="submit" class="btn btn-secondary btn-sm" disabled={loading === invitation.id}>
										Decline
									</button>
								</form>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if data.organizations.length > 0}
			<div class="org-list">
				{#each data.organizations as org}
					<a href="/org/{org.id}" class="org-item">
						<span class="org-name">{org.name}</span>
						<span class="org-role">{org.role}</span>
					</a>
				{/each}
			</div>
		{:else}
			<p class="no-orgs">You are not a member of any organizations yet.</p>
		{/if}

		<div class="actions">
			<a href="/org/new" class="btn btn-primary">Create New Organization</a>
			<a href="/auth/logout" class="btn btn-secondary">Sign Out</a>
		</div>

		<div class="help-link">
			<a href="/help">Need help? View documentation</a>
		</div>
	</div>
</div>

<style>
	.selector-page {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg);
		padding: var(--spacing-lg);
		min-height: 100vh;
	}

	.selector-card {
		background: var(--color-surface);
		border-radius: var(--radius-xl);
		padding: var(--spacing-2xl);
		width: 100%;
		max-width: 480px;
		box-shadow: var(--shadow-3);
	}

	.selector-card h1 {
		font-size: var(--font-size-2xl);
		font-weight: 600;
		color: var(--color-primary);
		text-align: center;
		margin-bottom: var(--spacing-xs);
		letter-spacing: -0.02em;
	}

	.subtitle {
		text-align: center;
		color: var(--color-text-secondary);
		font-size: var(--font-size-base);
		margin-bottom: var(--spacing-xl);
	}

	.error-message {
		background: rgba(244, 67, 54, 0.08);
		border-left: 4px solid var(--color-error);
		color: var(--color-error);
		padding: var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-lg);
	}

	.invitations-section {
		margin-bottom: var(--spacing-lg);
		padding-bottom: var(--spacing-lg);
		border-bottom: 1px solid var(--color-divider);
	}

	.invitations-section h2 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-success);
		margin-bottom: var(--spacing-md);
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.invitations-section h2::before {
		content: '';
		width: 8px;
		height: 8px;
		background: var(--color-success);
		border-radius: 50%;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.invitation-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.invitation-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md);
		background: rgba(76, 175, 80, 0.08);
		border-radius: var(--radius-lg);
		gap: var(--spacing-md);
		transition: all var(--transition-fast);
	}

	.invitation-item:hover {
		background: rgba(76, 175, 80, 0.12);
	}

	:global([data-theme='dark']) .invitation-item {
		background: rgba(76, 175, 80, 0.12);
	}

	:global([data-theme='dark']) .invitation-item:hover {
		background: rgba(76, 175, 80, 0.18);
	}

	.invitation-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.invitation-org {
		font-weight: 600;
		color: var(--color-text);
	}

	.invitation-meta {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.invitation-actions {
		display: flex;
		gap: var(--spacing-sm);
	}

	.org-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-xl);
	}

	.org-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		text-decoration: none;
		color: var(--color-text);
		transition: all var(--transition-fast);
	}

	.org-item:hover {
		border-color: var(--color-primary);
		background: rgba(var(--color-primary-rgb), 0.04);
		box-shadow: var(--shadow-1);
		transform: translateY(-1px);
	}

	.org-name {
		font-weight: 600;
		font-size: var(--font-size-base);
	}

	.org-role {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		text-transform: capitalize;
		padding: 4px 12px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-full);
	}

	.no-orgs {
		text-align: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-base);
		margin-bottom: var(--spacing-xl);
		padding: var(--spacing-xl);
		background: var(--color-surface-variant);
		border-radius: var(--radius-lg);
	}

	.actions {
		display: flex;
		gap: var(--spacing-md);
		justify-content: center;
	}

	.theme-toggle {
		position: fixed;
		top: var(--spacing-lg);
		right: var(--spacing-lg);
		width: 48px;
		height: 48px;
		border-radius: var(--radius-full);
		background: var(--color-surface);
		border: none;
		color: var(--color-text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all var(--transition-fast);
		box-shadow: var(--shadow-2);
	}

	.theme-toggle:hover {
		background: var(--color-surface);
		color: var(--color-primary);
		box-shadow: var(--shadow-3);
		transform: scale(1.05);
	}

	.theme-toggle svg {
		width: 22px;
		height: 22px;
	}

	.help-link {
		margin-top: var(--spacing-xl);
		text-align: center;
	}

	.help-link a {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		text-decoration: none;
		transition: color var(--transition-fast);
	}

	.help-link a:hover {
		color: var(--color-primary);
	}

	@media (max-width: 480px) {
		.selector-card {
			padding: var(--spacing-lg);
			border-radius: var(--radius-lg);
		}

		.invitation-item {
			flex-direction: column;
			align-items: flex-start;
		}

		.invitation-actions {
			width: 100%;
			justify-content: flex-end;
		}

		.actions {
			flex-direction: column;
		}

		.actions .btn {
			width: 100%;
		}
	}
</style>
