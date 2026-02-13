<script lang="ts">
	import { enhance } from '$app/forms';
	import { themeStore } from '$lib/stores/theme.svelte';

	let { data, form } = $props();
	let loading = $state<string | null>(null);

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'today';
		if (diffDays === 1) return 'yesterday';
		if (diffDays < 7) return `${diffDays} days ago`;
		return date.toLocaleDateString();
	}
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
								<span class="invitation-meta">Invited {formatDate(invitation.createdAt)}</span>
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
	}

	.selector-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-xl);
		width: 100%;
		max-width: 500px;
	}

	.selector-card h1 {
		font-size: var(--font-size-xl);
		font-weight: 700;
		color: var(--color-primary);
		text-align: center;
		margin-bottom: var(--spacing-xs);
	}

	.subtitle {
		text-align: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-lg);
	}

	.error-message {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
		text-align: center;
	}

	.invitations-section {
		margin-bottom: var(--spacing-lg);
		padding-bottom: var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
	}

	.invitations-section h2 {
		font-size: var(--font-size-base);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-sm);
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
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: var(--radius-md);
		gap: var(--spacing-md);
	}

	:global([data-theme='dark']) .invitation-item {
		background: rgba(34, 197, 94, 0.1);
		border-color: rgba(34, 197, 94, 0.3);
	}

	.invitation-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
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
		gap: var(--spacing-xs);
	}

	.btn-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
	}

	.org-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-lg);
	}

	.org-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		text-decoration: none;
		color: var(--color-text);
		transition: all 0.15s ease;
	}

	.org-item:hover {
		border-color: var(--color-primary);
		background: var(--color-bg);
	}

	.org-name {
		font-weight: 600;
	}

	.org-role {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		text-transform: capitalize;
	}

	.no-orgs {
		text-align: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-lg);
	}

	.actions {
		display: flex;
		gap: var(--spacing-sm);
		justify-content: center;
	}

	.theme-toggle {
		position: fixed;
		top: var(--spacing-lg);
		right: var(--spacing-lg);
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		color: var(--color-text);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: var(--shadow-md);
	}

	.theme-toggle:hover {
		background: var(--color-bg);
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.theme-toggle svg {
		width: 20px;
		height: 20px;
	}

	.help-link {
		margin-top: var(--spacing-lg);
		text-align: center;
	}

	.help-link a {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		text-decoration: none;
	}

	.help-link a:hover {
		color: var(--color-primary);
		text-decoration: underline;
	}

	@media (max-width: 480px) {
		.invitation-item {
			flex-direction: column;
			align-items: flex-start;
		}

		.invitation-actions {
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
