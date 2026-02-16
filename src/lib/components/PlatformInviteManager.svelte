<script lang="ts">
	import { browser } from '$app/environment';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	interface Invite {
		id: string;
		code: string;
		email: string | null;
		created_at: string;
		expires_at: string;
		used_at: string | null;
		used_by: string | null;
	}

	let invites = $state<Invite[]>([]);
	let isLoading = $state(true);
	let isCreating = $state(false);
	let newEmail = $state('');
	let expiresInDays = $state(7);
	let createdInvite = $state<{ code: string; registrationUrl: string; email: string | null } | null>(null);
	let copySuccess = $state(false);
	let errorMessage = $state('');

	// Load existing invites
	async function loadInvites() {
		try {
			const res = await fetch('/api/platform-invites');
			if (res.ok) {
				invites = await res.json();
			}
		} catch (e) {
			console.error('Failed to load invites:', e);
		} finally {
			isLoading = false;
		}
	}

	// Create a new invite
	async function createInvite() {
		isCreating = true;
		errorMessage = '';

		try {
			const res = await fetch('/api/platform-invites', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: newEmail.trim() || null,
					expiresInDays
				})
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.message || 'Failed to create invite');
			}

			const data = await res.json();
			createdInvite = {
				code: data.code,
				registrationUrl: data.registrationUrl,
				email: data.email
			};

			// Reload invites list
			await loadInvites();

			// Reset form
			newEmail = '';
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Failed to create invite';
		} finally {
			isCreating = false;
		}
	}

	// Delete an invite
	async function deleteInvite(id: string) {
		if (!confirm('Delete this invite? It will no longer be usable.')) return;

		try {
			await fetch('/api/platform-invites', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			await loadInvites();
		} catch (e) {
			console.error('Failed to delete invite:', e);
		}
	}

	// Copy to clipboard
	async function copyToClipboard(text: string) {
		if (browser) {
			await navigator.clipboard.writeText(text);
			copySuccess = true;
			setTimeout(() => (copySuccess = false), 2000);
		}
	}

	// Send email (opens default email client)
	function sendEmail() {
		if (!createdInvite) return;

		const subject = encodeURIComponent('You\'re invited to join Troop to Task');
		const body = encodeURIComponent(
			`You've been invited to join Troop to Task!\n\n` +
			`Click the link below to create your account:\n${createdInvite.registrationUrl}\n\n` +
			`Or enter this invite code manually: ${createdInvite.code}\n\n` +
			`This invite expires in ${expiresInDays} days.`
		);

		const mailto = `mailto:${createdInvite.email || ''}?subject=${subject}&body=${body}`;
		window.open(mailto, '_blank');
	}

	// Format date for display
	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// Check if invite is expired
	function isExpired(expiresAt: string): boolean {
		return new Date(expiresAt) < new Date();
	}

	// Initialize
	$effect(() => {
		loadInvites();
	});
</script>

<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="invite-title" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && onClose()}>
	<button class="modal-backdrop" onclick={onClose} tabindex="-1" aria-label="Close dialog"></button>
	<div class="modal invite-modal" role="document">
		<div class="modal-header">
			<h2 id="invite-title">Invite Someone to Troop to Task</h2>
			<button class="btn btn-secondary btn-sm close-btn" onclick={onClose} aria-label="Close">&times;</button>
		</div>

		<div class="modal-body">
			{#if createdInvite}
				<!-- Success State - Show created invite -->
				<div class="success-section">
					<div class="success-icon">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
							<polyline points="22 4 12 14.01 9 11.01" />
						</svg>
					</div>
					<h3>Invite Created!</h3>

					{#if createdInvite.email}
						<p class="invite-email">For: <strong>{createdInvite.email}</strong></p>
					{/if}

					<div class="invite-code-display">
						<label>Invite Code</label>
						<div class="code-box">
							<code>{createdInvite.code}</code>
							<button class="btn btn-secondary btn-sm" onclick={() => copyToClipboard(createdInvite!.code)}>
								Copy
							</button>
						</div>
					</div>

					<div class="invite-link-display">
						<label>Registration Link</label>
						<div class="link-box">
							<input type="text" readonly value={createdInvite.registrationUrl} class="input" />
							<button class="btn btn-secondary btn-sm" onclick={() => copyToClipboard(createdInvite!.registrationUrl)}>
								Copy
							</button>
						</div>
					</div>

					{#if copySuccess}
						<div class="copy-success">Copied to clipboard!</div>
					{/if}

					<div class="action-buttons">
						<button class="btn btn-primary" onclick={sendEmail}>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
								<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
								<polyline points="22,6 12,13 2,6" />
							</svg>
							Send via Email
						</button>
						<button class="btn btn-secondary" onclick={() => (createdInvite = null)}>
							Create Another
						</button>
					</div>
				</div>
			{:else}
				<!-- Create Invite Form -->
				<div class="create-section">
					<h4>Create New Invite</h4>

					{#if errorMessage}
						<div class="error-message">{errorMessage}</div>
					{/if}

					<div class="form-group">
						<label class="label" for="inviteEmail">Email Address (Optional)</label>
						<input
							id="inviteEmail"
							type="email"
							class="input"
							bind:value={newEmail}
							placeholder="Leave blank for anyone to use"
						/>
						<span class="field-hint">If provided, only this email can use the invite</span>
					</div>

					<div class="form-group">
						<label class="label" for="expiresIn">Expires In</label>
						<select id="expiresIn" class="select" bind:value={expiresInDays}>
							<option value={1}>1 day</option>
							<option value={7}>7 days</option>
							<option value={14}>14 days</option>
							<option value={30}>30 days</option>
							<option value={90}>90 days</option>
						</select>
					</div>

					<button class="btn btn-primary" onclick={createInvite} disabled={isCreating}>
						{isCreating ? 'Creating...' : 'Generate Invite'}
					</button>
				</div>

				<!-- Existing Invites -->
				<div class="invites-section">
					<h4>Your Invites</h4>

					{#if isLoading}
						<div class="loading">Loading...</div>
					{:else if invites.length === 0}
						<div class="empty-state">No invites created yet</div>
					{:else}
						<div class="invites-list">
							{#each invites as invite (invite.id)}
								<div class="invite-item" class:used={invite.used_at} class:expired={!invite.used_at && isExpired(invite.expires_at)}>
									<div class="invite-info">
										<code class="invite-code">{invite.code}</code>
										{#if invite.email}
											<span class="invite-target">{invite.email}</span>
										{/if}
										<span class="invite-date">
											{#if invite.used_at}
												Used {formatDate(invite.used_at)}
											{:else if isExpired(invite.expires_at)}
												Expired {formatDate(invite.expires_at)}
											{:else}
												Expires {formatDate(invite.expires_at)}
											{/if}
										</span>
									</div>
									{#if !invite.used_at}
										<button
											class="btn btn-danger btn-sm"
											onclick={() => deleteInvite(invite.id)}
											title="Delete invite"
										>
											<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
												<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
											</svg>
										</button>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<div class="modal-footer">
			<button class="btn btn-secondary" onclick={onClose}>Close</button>
		</div>
	</div>
</div>

<style>
	.invite-modal {
		width: 520px;
		max-width: 95vw;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
	}

	.close-btn {
		font-size: 1.25rem;
		line-height: 1;
		padding: var(--spacing-xs) var(--spacing-sm);
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
	}

	h4 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--spacing-md);
	}

	.field-hint {
		display: block;
		margin-top: var(--spacing-xs);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.error-message {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	/* Create Section */
	.create-section {
		padding-bottom: var(--spacing-lg);
		margin-bottom: var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
	}

	.create-section .btn-primary {
		width: 100%;
		margin-top: var(--spacing-sm);
	}

	/* Success Section */
	.success-section {
		text-align: center;
		padding: var(--spacing-lg) 0;
	}

	.success-icon {
		width: 64px;
		height: 64px;
		margin: 0 auto var(--spacing-md);
		background: #dcfce7;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #16a34a;
	}

	.success-icon svg {
		width: 32px;
		height: 32px;
	}

	.success-section h3 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		margin-bottom: var(--spacing-md);
	}

	.invite-email {
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-lg);
	}

	.invite-code-display,
	.invite-link-display {
		text-align: left;
		margin-bottom: var(--spacing-md);
	}

	.invite-code-display label,
	.invite-link-display label {
		display: block;
		font-size: var(--font-size-xs);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		margin-bottom: var(--spacing-xs);
	}

	.code-box,
	.link-box {
		display: flex;
		gap: var(--spacing-sm);
		align-items: center;
	}

	.code-box code {
		flex: 1;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-lg);
		font-weight: 600;
		letter-spacing: 2px;
	}

	.link-box .input {
		flex: 1;
		font-size: var(--font-size-xs);
	}

	.copy-success {
		color: #16a34a;
		font-size: var(--font-size-sm);
		margin: var(--spacing-sm) 0;
	}

	.action-buttons {
		display: flex;
		gap: var(--spacing-sm);
		justify-content: center;
		margin-top: var(--spacing-lg);
	}

	.action-buttons .btn svg {
		margin-right: var(--spacing-xs);
	}

	/* Invites List */
	.invites-section {
		margin-top: var(--spacing-md);
	}

	.loading,
	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-lg);
	}

	.invites-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.invite-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.invite-item.used {
		opacity: 0.6;
	}

	.invite-item.expired {
		opacity: 0.5;
		background: #fef2f2;
	}

	.invite-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.invite-code {
		font-weight: 600;
		font-size: var(--font-size-sm);
	}

	.invite-target {
		font-size: var(--font-size-xs);
		color: var(--color-text);
	}

	.invite-date {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.invite-item .btn {
		padding: var(--spacing-xs);
	}
</style>
