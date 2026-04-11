<script lang="ts">
	import { enhance } from '$app/forms';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { formatRelativeDate } from '$lib/utils/dates';

	let { data, form } = $props();
	let loading = $state<string | null>(null);
	let successMessage = $state<string | null>(null);
	let orgFilter = $state('');
	let successTimer: ReturnType<typeof setTimeout>;

	function showSuccess(msg: string) {
		successMessage = msg;
		clearTimeout(successTimer);
		successTimer = setTimeout(() => (successMessage = null), 4000);
	}

	function formatRole(role: string): string {
		const map: Record<string, string> = { admin: 'Administrator', member: 'Member' };
		return map[role.toLowerCase()] ?? role.charAt(0).toUpperCase() + role.slice(1);
	}

	const filteredOrgs = $derived(
		orgFilter.trim()
			? data.organizations.filter((org) =>
					org.name.toLowerCase().includes(orgFilter.toLowerCase().trim())
				)
			: data.organizations
	);
</script>

<svelte:head>
	<title>Dashboard - Troop to Task</title>
</svelte:head>

<div class="selector-page">
	<button class="theme-toggle btn btn-secondary btn-icon" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
		{#if themeStore.isDark}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="5" />
				<line x1="12" y1="1" x2="12" y2="3" />
				<line x1="12" y1="21" x2="12" y2="23" />
				<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
				<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
				<line x1="1" y1="12" x2="3" y2="12" />
				<line x1="21" y1="12" x2="23" y2="12" />
				<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
				<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
			</svg>
		{/if}
	</button>

	<div class="selector-shell">
		<section class="selector-intro">
			<p class="selector-kicker">Command Access</p>
			<h1>Choose where to work.</h1>
			<p class="selector-copy">
				Move into an organization, process pending invitations, or create a new workspace before the next handoff.
			</p>

			<div class="selector-help">
				<a href="/help">Need a quick refresher? Open the field guide.</a>
			</div>
		</section>

		<section class="selector-panel">
			<header class="selector-panel-header">
				<h2>Available workspaces</h2>
			</header>

			{#if form?.error}
				<div class="selector-alert" role="alert">{form.error}</div>
			{/if}

			{#if successMessage}
				<div class="selector-alert selector-alert-success" role="status">{successMessage}</div>
			{/if}

			{#if data.pendingInvitations.length > 0}
				<section class="selector-section">
					<div class="selector-section-header">
						<p class="selector-section-kicker">Pending Invitations</p>
						<span class="selector-section-count">{data.pendingInvitations.length}</span>
					</div>

					<div class="invitation-list">
						{#each data.pendingInvitations as invitation (invitation.id)}
							<div class="invitation-item">
								<div class="invitation-copy">
									<span class="invitation-org">{invitation.organizationName}</span>
									<span class="invitation-meta">Invited {formatRelativeDate(invitation.createdAt)}</span>
								</div>

								<div class="invitation-actions">
									<form
										method="POST"
										action="?/acceptInvitation"
										use:enhance={() => {
											loading = invitation.id;
											return async ({ result, update }) => {
												loading = null;
												if (result.type === 'success') showSuccess(`Joined ${invitation.organizationName}.`);
												await update();
											};
										}}
									>
										<input type="hidden" name="invitationId" value={invitation.id} />
										<button type="submit" class="btn btn-amber btn-sm" disabled={loading === invitation.id}>
											{loading === invitation.id ? 'Accepting...' : 'Accept'}
										</button>
									</form>
									<form
										method="POST"
										action="?/declineInvitation"
										use:enhance={() => {
											loading = invitation.id;
											return async ({ result, update }) => {
												loading = null;
												if (result.type === 'success') showSuccess('Invitation declined.');
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
				</section>
			{/if}

			<section class="selector-section">
				<div class="selector-section-header">
					<p class="selector-section-kicker">Organizations</p>
					{#if data.organizations.length > 0}
						<span class="selector-section-count">{data.organizations.length}</span>
					{/if}
				</div>

				{#if data.organizations.length > 4}
					<input
						type="search"
						class="org-filter"
						placeholder="Filter organizations…"
						bind:value={orgFilter}
						aria-label="Filter organizations"
					/>
				{/if}

				{#if data.organizations.length > 0}
					<div class="org-list">
						{#each filteredOrgs as org}
							<a href="/org/{org.id}" class="org-item">
								<div class="org-copy">
									<span class="org-name">{org.name}</span>
									<span class="org-role">{formatRole(org.role)}</span>
								</div>
								<span class="org-arrow" aria-hidden="true">Open</span>
							</a>
						{/each}
						{#if filteredOrgs.length === 0}
							<p class="org-filter-empty">No organizations match "{orgFilter}"</p>
						{/if}
					</div>
				{:else}
					<div class="selector-empty">
						<p>You are not a member of any organizations yet.</p>
						<span>Create a new organization below to start building the workspace.</span>
					</div>
				{/if}
			</section>

			<div class="selector-actions">
				<a href="/org/new" class="btn btn-amber">Create Organization</a>
				<a href="/auth/logout" class="btn btn-secondary">Sign Out</a>
			</div>
		</section>
	</div>
</div>

<style>
	.selector-page {
		min-height: 100vh;
		padding: clamp(var(--sp-6), 4vw, var(--sp-12));
		background:
			linear-gradient(to bottom, rgba(14, 14, 13, 0.03), rgba(14, 14, 13, 0)) 0 0 / 100% 12rem no-repeat,
			var(--surface-page);
	}

	.selector-shell {
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(20rem, 32rem);
		gap: clamp(var(--sp-8), 5vw, var(--sp-16));
		align-items: start;
		max-width: 1120px;
		margin: 0 auto;
		padding-top: clamp(var(--sp-12), 10vh, var(--sp-20));
	}

	.selector-intro {
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
		max-width: 36rem;
	}

	.selector-kicker,
	.selector-section-kicker,
	.org-role,
	.org-arrow {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.selector-kicker {
		margin: 0;
		color: var(--amber);
	}

	.selector-intro h1,
	.selector-panel-header h2 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--font-weight-display);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		line-height: 0.95;
		color: var(--text-primary);
	}

	.selector-intro h1 {
		font-size: clamp(3rem, 2.3rem + 2vw, 4.7rem);
		max-width: 10ch;
	}

	.selector-panel-header h2 {
		font-size: clamp(2rem, 1.6rem + 1vw, 2.8rem);
	}

	.selector-copy {
		margin: 0;
		font-size: var(--text-base);
		line-height: var(--line-height-copy);
		color: var(--text-secondary);
		max-width: 34rem;
	}

	.selector-help a {
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	.selector-help a:hover {
		color: var(--amber-dark);
	}

	.selector-panel {
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
		padding: clamp(var(--sp-5), 2vw, var(--sp-8));
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
	}

	.selector-panel-header {
		display: flex;
		flex-direction: column;
	}

	.selector-alert {
		padding: var(--sp-4);
		border-left: 3px solid var(--danger);
		background: color-mix(in srgb, var(--danger-bg) 72%, var(--surface-panel));
		color: var(--danger);
		font-size: var(--text-sm);
		line-height: 1.55;
	}

	.selector-alert-success {
		border-left-color: var(--amber);
		background: color-mix(in srgb, var(--amber-light) 40%, var(--surface-panel));
		color: var(--amber-dark);
	}

	.selector-section {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.selector-section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding-top: var(--sp-4);
		border-top: var(--border-thin);
	}

	.selector-section-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.75rem;
		height: 1.75rem;
		padding: 0 0.4rem;
		border: 1px solid rgba(var(--amber-rgb), 0.35);
		border-radius: var(--radius-md);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		color: var(--amber-dark);
	}

	.org-filter {
		width: 100%;
		padding: var(--sp-2) var(--sp-3);
		background: var(--surface-subtle);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--text-primary);
		transition: border-color var(--transition-fast);
	}

	.org-filter:focus {
		outline: none;
		border-color: rgba(var(--amber-rgb), 0.5);
	}

	.org-filter-empty {
		margin: 0;
		padding: var(--sp-3) var(--sp-4);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
	}

	.invitation-list,
	.org-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.invitation-item,
	.org-item,
	.selector-empty {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-panel) 88%, var(--surface-subtle) 12%);
	}

	.invitation-item {
		align-items: flex-start;
	}

	.invitation-copy,
	.org-copy,
	.selector-empty {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.invitation-org,
	.org-name {
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
	}

	.invitation-meta {
		font-size: var(--text-sm);
		color: var(--text-tertiary);
	}

	.invitation-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		justify-content: flex-end;
	}

	.org-item {
		color: inherit;
		transition:
			border-color var(--transition-fast),
			background var(--transition-fast),
			box-shadow var(--transition-fast);
	}

	.org-item:hover {
		border-color: rgba(var(--amber-rgb), 0.34);
		background: color-mix(in srgb, var(--surface-panel) 82%, var(--amber-light) 18%);
		box-shadow: var(--shadow-sm);
	}

	.org-role {
		color: var(--text-tertiary);
	}

	.org-arrow {
		color: var(--amber-dark);
		flex-shrink: 0;
	}

	.selector-empty {
		align-items: flex-start;
	}

	.selector-empty p,
	.selector-empty span {
		margin: 0;
	}

	.selector-empty p {
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
	}

	.selector-empty span {
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.selector-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		padding-top: var(--sp-4);
		border-top: var(--border-thin);
	}

	.theme-toggle {
		position: fixed;
		top: var(--sp-5);
		right: var(--sp-5);
		z-index: 1;
	}

	.theme-toggle svg {
		width: 18px;
		height: 18px;
	}

	@media (max-width: 900px) {
		.selector-shell {
			grid-template-columns: 1fr;
			padding-top: calc(var(--sp-12) + var(--sp-6));
		}
	}

	@media (max-width: 640px) {
		.selector-page {
			padding: var(--sp-4);
		}

		.invitation-item,
		.org-item {
			flex-direction: column;
			align-items: flex-start;
		}

		.invitation-actions,
		.selector-actions {
			width: 100%;
		}

		.invitation-actions :global(form) {
			flex: 1;
		}

		.invitation-actions :global(form button),
		.selector-actions .btn {
			width: 100%;
		}
	}
</style>
