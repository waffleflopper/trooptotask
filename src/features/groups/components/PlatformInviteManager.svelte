<script lang="ts">
	import { browser } from '$app/environment';
	import { formatDisplayDate } from '$lib/utils/dates';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as NativeSelect from '$lib/components/ui/native-select';

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

	let deleteInviteId = $state<string | null>(null);

	// Delete an invite
	function deleteInvite(id: string) {
		deleteInviteId = id;
	}

	async function doDeleteInvite() {
		const id = deleteInviteId;
		if (!id) return;
		deleteInviteId = null;

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

		const subject = encodeURIComponent("You're invited to join Troop to Task");
		const body = encodeURIComponent(
			`You've been invited to join Troop to Task!\n\n` +
				`Click the link below to create your account:\n${createdInvite.registrationUrl}\n\n` +
				`Or enter this invite code manually: ${createdInvite.code}\n\n` +
				`This invite expires in ${expiresInDays} days.`
		);

		const mailto = `mailto:${createdInvite.email || ''}?subject=${subject}&body=${body}`;
		window.open(mailto, '_blank');
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

<AppDialog.Root open closeBlocked={isCreating} {onClose}>
	<AppDialog.Content closeBlocked={isCreating}>
		<AppDialog.Header>
			<AppDialog.Title id="invite-title">Invite Someone to Troop to Task</AppDialog.Title>
			<AppDialog.Description>Create platform invite links and review existing invite status.</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body>
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
						<p class="field-label">Invite Code</p>
						<div class="code-box">
							<code>{createdInvite.code}</code>
							<Button variant="outline" size="sm" onclick={() => copyToClipboard(createdInvite!.code)}>Copy</Button>
						</div>
					</div>

					<div class="invite-link-display">
						<label for="invite-registration-link">Registration Link</label>
						<div class="link-box">
							<Input id="invite-registration-link" type="text" readonly value={createdInvite.registrationUrl} />
							<Button variant="outline" size="sm" onclick={() => copyToClipboard(createdInvite!.registrationUrl)}>
								Copy
							</Button>
						</div>
					</div>

					{#if copySuccess}
						<div class="copy-success">Copied to clipboard!</div>
					{/if}

					<div class="action-buttons">
						<Button onclick={sendEmail}>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
								<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
								<polyline points="22,6 12,13 2,6" />
							</svg>
							Send via Email
						</Button>
						<Button variant="outline" onclick={() => (createdInvite = null)}>Create Another</Button>
					</div>
				</div>
			{:else}
				<!-- Create Invite Form -->
				<div class="create-section">
					<h4>Create New Invite</h4>

					{#if errorMessage}
						<div class="error-message">{errorMessage}</div>
					{/if}

					<div class="grid gap-2">
						<label class="field-label" for="inviteEmail">Email Address (Optional)</label>
						<Input id="inviteEmail" type="email" bind:value={newEmail} placeholder="Leave blank for anyone to use" />
						<span class="invite-field-hint">If provided, only this email can use the invite</span>
					</div>

					<div class="grid gap-2">
						<label class="field-label" for="expiresIn">Expires In</label>
						<NativeSelect.Root
							id="expiresIn"
							class="w-full"
							value={String(expiresInDays)}
							onchange={(event) => (expiresInDays = Number(event.currentTarget.value))}
						>
							<NativeSelect.Option value="1">1 day</NativeSelect.Option>
							<NativeSelect.Option value="7">7 days</NativeSelect.Option>
							<NativeSelect.Option value="14">14 days</NativeSelect.Option>
							<NativeSelect.Option value="30">30 days</NativeSelect.Option>
							<NativeSelect.Option value="90">90 days</NativeSelect.Option>
						</NativeSelect.Root>
					</div>

					<Button class="w-full" onclick={createInvite} disabled={isCreating}>
						{isCreating ? 'Creating...' : 'Generate Invite'}
					</Button>
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
								<div
									class="invite-item"
									class:used={invite.used_at}
									class:expired={!invite.used_at && isExpired(invite.expires_at)}
								>
									<div class="invite-info">
										<code class="invite-code">{invite.code}</code>
										{#if invite.email}
											<span class="invite-target">{invite.email}</span>
										{/if}
										<span class="invite-date">
											{#if invite.used_at}
												Used {formatDisplayDate(invite.used_at)}
											{:else if isExpired(invite.expires_at)}
												Expired {formatDisplayDate(invite.expires_at)}
											{:else}
												Expires {formatDisplayDate(invite.expires_at)}
											{/if}
										</span>
									</div>
									{#if !invite.used_at}
										<Button
											variant="destructive"
											size="icon-sm"
											onclick={() => deleteInvite(invite.id)}
											title="Delete invite"
										>
											<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
												<path
													fill-rule="evenodd"
													d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
													clip-rule="evenodd"
												/>
											</svg>
										</Button>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button type="button" variant="outline" onclick={onClose} disabled={isCreating}>Close</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if deleteInviteId}
	<ConfirmDialog
		title="Delete Invite"
		message="Delete this invite? It will no longer be usable."
		confirmLabel="Delete"
		variant="danger"
		onConfirm={doDeleteInvite}
		onCancel={() => (deleteInviteId = null)}
	/>
{/if}

<style>
	h4 {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 1rem;
	}

	.field-label,
	.invite-field-hint {
		display: block;
		margin-top: 0.25rem;
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}

	.error-message {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: 0.5rem 1rem;
		border-radius: var(--radius);
		font-size: 0.75rem;
		margin-bottom: 1rem;
	}

	/* Create Section */
	.create-section {
		padding-bottom: 1.5rem;
		margin-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	/* Success Section */
	.success-section {
		text-align: center;
		padding: 1.5rem 0;
	}

	.success-icon {
		width: 64px;
		height: 64px;
		margin: 0 auto 1rem;
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
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 1rem;
	}

	.invite-email {
		color: var(--muted-foreground);
		margin-bottom: 1.5rem;
	}

	.invite-code-display,
	.invite-link-display {
		text-align: left;
		margin-bottom: 1rem;
	}

	.invite-code-display .field-label,
	.invite-link-display label {
		display: block;
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--muted-foreground);
		text-transform: uppercase;
		margin-bottom: 0.25rem;
	}

	.code-box,
	.link-box {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.code-box code {
		flex: 1;
		padding: 0.5rem 1rem;
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 1rem;
		font-weight: 600;
		letter-spacing: 2px;
	}

	.link-box :global([data-slot='input']) {
		flex: 1;
		font-size: 0.6875rem;
	}

	.copy-success {
		color: #16a34a;
		font-size: 0.75rem;
		margin: 0.5rem 0;
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
		margin-top: 1.5rem;
	}

	/* Invites List */
	.invites-section {
		margin-top: 1rem;
	}

	.loading,
	.empty-state {
		text-align: center;
		color: var(--muted-foreground);
		padding: 1.5rem;
	}

	.invites-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.invite-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1rem;
		background: var(--background);
		border-radius: var(--radius);
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
		font-size: 0.75rem;
	}

	.invite-target {
		font-size: 0.6875rem;
		color: var(--foreground);
	}

	.invite-date {
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}

	.invite-item :global([data-slot='button']) {
		padding: 0.25rem;
	}
</style>
