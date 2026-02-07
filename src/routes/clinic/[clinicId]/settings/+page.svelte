<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Settings - {data.clinic?.name} - Troop to Task</title>
</svelte:head>

<div class="settings-page">
	<header class="settings-header">
		<div class="header-content">
			<a href="/clinic/{data.clinicId}" class="back-link">&larr; Back to Calendar</a>
			<h1>Clinic Settings</h1>
		</div>
	</header>

	<main class="settings-content">
		<div class="settings-card">
			<h2>Clinic Information</h2>

			{#if data.isOwner}
				<form
					method="POST"
					action="?/updateName"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
				>
					{#if form?.error}
						<div class="error-message">{form.error}</div>
					{/if}
					{#if form?.success}
						<div class="success-message">Clinic name updated!</div>
					{/if}

					<div class="form-group">
						<label class="label" for="name">Clinic Name</label>
						<input
							id="name"
							name="name"
							type="text"
							class="input"
							value={data.clinic?.name ?? ''}
							required
						/>
					</div>

					<button type="submit" class="btn btn-primary" disabled={loading}>
						{loading ? 'Saving...' : 'Update Name'}
					</button>
				</form>
			{:else}
				<p class="clinic-name-display">{data.clinic?.name}</p>
				<p class="hint">Only the clinic owner can edit the name.</p>
			{/if}
		</div>

		<div class="settings-card">
			<h2>Members</h2>

			<div class="member-list">
				{#each data.members as member}
					<div class="member-item">
						<div class="member-info">
							<span class="member-id">{member.userId.slice(0, 8)}...</span>
							<span class="member-role {member.role}">{member.role}</span>
						</div>
						{#if data.isOwner && member.role !== 'owner'}
							<form method="POST" action="?/removeMember" use:enhance>
								<input type="hidden" name="membershipId" value={member.id} />
								<button
									type="submit"
									class="btn btn-danger btn-sm"
									onclick={(e) => {
										if (!confirm('Remove this member from the clinic?')) {
											e.preventDefault();
										}
									}}
								>
									Remove
								</button>
							</form>
						{/if}
					</div>
				{/each}
			</div>

			{#if form?.memberError}
				<div class="error-message">{form.memberError}</div>
			{/if}
		</div>

		{#if data.isOwner}
			<div class="settings-card">
				<h2>Invite Members</h2>
				<p class="hint">Invite team members by email. They'll gain access after registering or logging in.</p>

				<form
					method="POST"
					action="?/invite"
					use:enhance={() => {
						return async ({ update }) => {
							await update();
						};
					}}
				>
					{#if form?.inviteError}
						<div class="error-message">{form.inviteError}</div>
					{/if}
					{#if form?.inviteSuccess}
						<div class="success-message">Invitation sent!</div>
					{/if}

					<div class="invite-form">
						<input
							name="email"
							type="email"
							class="input"
							placeholder="colleague@example.com"
							required
						/>
						<button type="submit" class="btn btn-primary">Invite</button>
					</div>
				</form>

				{#if data.invitations.length > 0}
					<h3>Pending Invitations</h3>
					<div class="invitation-list">
						{#each data.invitations as invite}
							<div class="invitation-item">
								<span class="invite-email">{invite.email}</span>
								<form method="POST" action="?/revokeInvite" use:enhance>
									<input type="hidden" name="inviteId" value={invite.id} />
									<button type="submit" class="btn btn-secondary btn-sm">Revoke</button>
								</form>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<div class="settings-card">
			<h2>Your Account</h2>
			<a href="/auth/logout" class="btn btn-secondary">Sign Out</a>
			<a href="/" class="btn btn-secondary">Switch Clinic</a>
		</div>
	</main>
</div>

<style>
	.settings-page {
		min-height: 100%;
		background: var(--color-bg);
	}

	.settings-header {
		background: var(--color-primary);
		color: white;
		padding: var(--spacing-md) var(--spacing-lg);
	}

	.header-content {
		max-width: 800px;
		margin: 0 auto;
	}

	.back-link {
		color: rgba(255, 255, 255, 0.8);
		text-decoration: none;
		font-size: var(--font-size-sm);
	}

	.back-link:hover {
		color: white;
	}

	.settings-header h1 {
		font-size: var(--font-size-xl);
		font-weight: 700;
		margin-top: var(--spacing-sm);
	}

	.settings-content {
		max-width: 800px;
		margin: 0 auto;
		padding: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.settings-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.settings-card h2 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		margin-bottom: var(--spacing-md);
	}

	.settings-card h3 {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin-top: var(--spacing-lg);
		margin-bottom: var(--spacing-sm);
	}

	.hint {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-md);
	}

	.clinic-name-display {
		font-size: var(--font-size-lg);
		font-weight: 600;
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

	.success-message {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: #16a34a;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.member-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.member-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.member-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.member-id {
		font-family: monospace;
		font-size: var(--font-size-sm);
	}

	.member-role {
		font-size: var(--font-size-sm);
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-weight: 500;
		text-transform: capitalize;
	}

	.member-role.owner {
		background: var(--color-primary);
		color: white;
	}

	.member-role.member {
		background: var(--color-border);
		color: var(--color-text);
	}

	.invite-form {
		display: flex;
		gap: var(--spacing-sm);
	}

	.invite-form .input {
		flex: 1;
	}

	.invitation-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.invitation-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.invite-email {
		font-size: var(--font-size-sm);
	}

	.settings-card .btn + .btn {
		margin-left: var(--spacing-sm);
	}
</style>
