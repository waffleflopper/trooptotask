<script lang="ts">
	import { enhance } from '$app/forms';
	import type {
		ClinicMember,
		ClinicMemberPermissions,
		PermissionPreset
	} from '$lib/types';
	import { PERMISSION_PRESETS, getPermissionPreset } from '$lib/types';

	interface Invitation {
		id: string;
		email: string;
		status: string;
		createdAt: string;
		canViewCalendar: boolean;
		canEditCalendar: boolean;
		canViewPersonnel: boolean;
		canEditPersonnel: boolean;
		canViewTraining: boolean;
		canEditTraining: boolean;
		canManageMembers: boolean;
	}

	interface Props {
		clinicId: string;
		members: ClinicMember[];
		invitations: Invitation[];
		isOwner: boolean;
		canManageMembers: boolean;
		form?: {
			error?: string;
			success?: boolean;
			inviteError?: string;
			inviteSuccess?: boolean;
			inviteMessage?: string;
			inviteEmail?: string;
			memberError?: string;
			permissionError?: string;
			permissionSuccess?: boolean;
			transferError?: string;
			transferSuccess?: boolean;
		};
	}

	let {
		clinicId,
		members,
		invitations,
		isOwner,
		canManageMembers,
		form
	}: Props = $props();

	let expandedMemberId = $state<string | null>(null);
	let inviteEmail = $state('');
	let invitePreset = $state<Exclude<PermissionPreset, 'owner' | 'custom'>>('full-editor');
	let showTransferConfirm = $state(false);
	let transferTargetId = $state<string | null>(null);
	let loading = $state(false);

	const presetOptions: { value: Exclude<PermissionPreset, 'owner' | 'custom'>; label: string }[] = [
		{ value: 'admin', label: 'Admin' },
		{ value: 'full-editor', label: 'Full Editor' },
		{ value: 'calendar-only', label: 'Calendar Only' },
		{ value: 'personnel-only', label: 'Personnel Only' },
		{ value: 'training-only', label: 'Training Only' },
		{ value: 'viewer', label: 'Viewer' }
	];

	function getPresetLabel(preset: PermissionPreset): string {
		switch (preset) {
			case 'owner':
				return 'Owner';
			case 'admin':
				return 'Admin';
			case 'full-editor':
				return 'Full Editor';
			case 'calendar-only':
				return 'Calendar Only';
			case 'personnel-only':
				return 'Personnel Only';
			case 'training-only':
				return 'Training Only';
			case 'viewer':
				return 'Viewer';
			case 'custom':
				return 'Custom';
		}
	}

	function getMemberPreset(member: ClinicMember): PermissionPreset {
		if (member.role === 'owner') return 'owner';
		return getPermissionPreset({
			canViewCalendar: member.canViewCalendar,
			canEditCalendar: member.canEditCalendar,
			canViewPersonnel: member.canViewPersonnel,
			canEditPersonnel: member.canEditPersonnel,
			canViewTraining: member.canViewTraining,
			canEditTraining: member.canEditTraining,
			canManageMembers: member.canManageMembers
		});
	}

	function toggleExpanded(memberId: string) {
		if (expandedMemberId === memberId) {
			expandedMemberId = null;
		} else {
			expandedMemberId = memberId;
		}
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 7) return `${diffDays} days ago`;
		return date.toLocaleDateString();
	}

	function getInvitePreset(invite: Invitation): PermissionPreset {
		return getPermissionPreset({
			canViewCalendar: invite.canViewCalendar,
			canEditCalendar: invite.canEditCalendar,
			canViewPersonnel: invite.canViewPersonnel,
			canEditPersonnel: invite.canEditPersonnel,
			canViewTraining: invite.canViewTraining,
			canEditTraining: invite.canEditTraining,
			canManageMembers: invite.canManageMembers
		});
	}

	function handlePresetChange(memberId: string, preset: string) {
		// Close expanded view when selecting a preset
		if (preset !== 'custom') {
			expandedMemberId = null;
		}
	}
</script>

<div class="member-manager">
	<div class="section">
		<h2>Clinic Members</h2>
		<div class="member-list">
			{#each members as member (member.id)}
				{@const preset = getMemberPreset(member)}
				<div class="member-card" class:expanded={expandedMemberId === member.id}>
					<div class="member-row">
						<div class="member-info">
							{#if member.email}
								<span class="member-email">{member.email}</span>
							{:else}
								<span class="member-id">{member.userId.slice(0, 8)}...</span>
							{/if}
						</div>

						<div class="member-actions">
							{#if member.role === 'owner'}
								<span class="role-badge owner">Owner</span>
							{:else if canManageMembers}
								<form
									method="POST"
									action="?/updatePermissions"
									class="preset-form"
									use:enhance={() => {
										loading = true;
										return async ({ update }) => {
											loading = false;
											await update();
										};
									}}
								>
									<input type="hidden" name="membershipId" value={member.id} />
									<select
										name="preset"
										class="preset-select"
										value={preset === 'custom' ? 'custom' : preset}
										onchange={(e) => {
											handlePresetChange(member.id, e.currentTarget.value);
											if (e.currentTarget.value !== 'custom') {
												e.currentTarget.form?.requestSubmit();
											} else {
												expandedMemberId = member.id;
											}
										}}
									>
										{#each presetOptions as option}
											<option value={option.value}>{option.label}</option>
										{/each}
										{#if preset === 'custom'}
											<option value="custom">Custom</option>
										{/if}
									</select>
								</form>

								<button
									type="button"
									class="expand-btn"
									onclick={() => toggleExpanded(member.id)}
									title="Edit permissions"
								>
									{expandedMemberId === member.id ? '▲' : '▼'}
								</button>

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
							{:else}
								<span class="role-badge">{getPresetLabel(preset)}</span>
							{/if}

							{#if isOwner && member.role !== 'owner'}
								<button
									type="button"
									class="btn btn-secondary btn-sm"
									onclick={() => {
										transferTargetId = member.userId;
										showTransferConfirm = true;
									}}
								>
									Transfer
								</button>
							{/if}
						</div>
					</div>

					{#if expandedMemberId === member.id && canManageMembers && member.role !== 'owner'}
						<form
							method="POST"
							action="?/updatePermissions"
							class="permissions-form"
							use:enhance={() => {
								loading = true;
								return async ({ update }) => {
									loading = false;
									expandedMemberId = null;
									await update();
								};
							}}
						>
							<input type="hidden" name="membershipId" value={member.id} />
							<input type="hidden" name="preset" value="custom" />

							<div class="permission-grid">
								<div class="permission-section">
									<h4>Calendar</h4>
									<label class="checkbox-label">
										<input
											type="checkbox"
											name="canViewCalendar"
											checked={member.canViewCalendar}
										/>
										View
									</label>
									<label class="checkbox-label">
										<input
											type="checkbox"
											name="canEditCalendar"
											checked={member.canEditCalendar}
										/>
										Edit
									</label>
								</div>

								<div class="permission-section">
									<h4>Personnel</h4>
									<label class="checkbox-label">
										<input
											type="checkbox"
											name="canViewPersonnel"
											checked={member.canViewPersonnel}
										/>
										View
									</label>
									<label class="checkbox-label">
										<input
											type="checkbox"
											name="canEditPersonnel"
											checked={member.canEditPersonnel}
										/>
										Edit
									</label>
								</div>

								<div class="permission-section">
									<h4>Training</h4>
									<label class="checkbox-label">
										<input
											type="checkbox"
											name="canViewTraining"
											checked={member.canViewTraining}
										/>
										View
									</label>
									<label class="checkbox-label">
										<input
											type="checkbox"
											name="canEditTraining"
											checked={member.canEditTraining}
										/>
										Edit
									</label>
								</div>

								<div class="permission-section">
									<h4>Members</h4>
									<label class="checkbox-label">
										<input
											type="checkbox"
											name="canManageMembers"
											checked={member.canManageMembers}
										/>
										Manage
									</label>
								</div>
							</div>

							<div class="permission-actions">
								<button type="button" class="btn btn-secondary" onclick={() => (expandedMemberId = null)}>
									Cancel
								</button>
								<button type="submit" class="btn btn-primary" disabled={loading}>
									{loading ? 'Saving...' : 'Save Permissions'}
								</button>
							</div>
						</form>
					{/if}
				</div>
			{/each}
		</div>

		{#if form?.memberError}
			<div class="error-message">{form.memberError}</div>
		{/if}
		{#if form?.permissionError}
			<div class="error-message">{form.permissionError}</div>
		{/if}
		{#if form?.permissionSuccess}
			<div class="success-message">Permissions updated!</div>
		{/if}
	</div>

	{#if canManageMembers}
		<div class="section">
			<h2>Invite New Member</h2>
			<form
				method="POST"
				action="?/invite"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
						if (!form?.inviteError) {
							inviteEmail = '';
						}
					};
				}}
			>
				{#if form?.inviteError}
					<div class="error-message">{form.inviteError}</div>
				{/if}
				{#if form?.inviteSuccess}
					<div class="success-message">
						{#if form?.inviteMessage}
							{form.inviteMessage}
						{:else}
							Invitation created!
						{/if}
					</div>
				{/if}

				<p class="invite-note">
					Note: There are no email notifications. The invited user needs to log in to Troop to Task to see and accept their invitation.
				</p>

				<div class="invite-form">
					<input
						name="email"
						type="email"
						class="input"
						placeholder="colleague@example.com"
						bind:value={inviteEmail}
						required
					/>
					<select name="preset" class="preset-select" bind:value={invitePreset}>
						{#each presetOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
					<button type="submit" class="btn btn-primary" disabled={loading}>
						{loading ? 'Sending...' : 'Invite'}
					</button>
				</div>
			</form>
		</div>

		{#if invitations.length > 0}
			<div class="section">
				<h2>Pending Invitations</h2>
				<div class="invitation-list">
					{#each invitations as invite}
						{@const invitePreset = getInvitePreset(invite)}
						<div class="invitation-item">
							<div class="invite-info">
								<span class="invite-email">{invite.email}</span>
								<span class="invite-meta">
									{getPresetLabel(invitePreset)} - Sent {formatDate(invite.createdAt)}
								</span>
							</div>
							<form method="POST" action="?/revokeInvite" use:enhance>
								<input type="hidden" name="inviteId" value={invite.id} />
								<button type="submit" class="btn btn-secondary btn-sm">Revoke</button>
							</form>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}

	{#if showTransferConfirm && transferTargetId}
		<div class="modal-overlay" onclick={() => (showTransferConfirm = false)} role="presentation">
			<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
				<h3>Transfer Ownership</h3>
				<p>
					Are you sure you want to transfer ownership of this clinic?
					You will become an Admin member and lose owner privileges.
				</p>
				<p class="warning">This action cannot be undone by you.</p>

				{#if form?.transferError}
					<div class="error-message">{form.transferError}</div>
				{/if}

				<form
					method="POST"
					action="?/transferOwnership"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							showTransferConfirm = false;
							await update();
						};
					}}
				>
					<input type="hidden" name="newOwnerId" value={transferTargetId} />
					<div class="modal-actions">
						<button
							type="button"
							class="btn btn-secondary"
							onclick={() => (showTransferConfirm = false)}
						>
							Cancel
						</button>
						<button type="submit" class="btn btn-danger" disabled={loading}>
							{loading ? 'Transferring...' : 'Transfer Ownership'}
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}
</div>

<style>
	.member-manager {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.section {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.section h2 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		margin-bottom: var(--spacing-md);
	}

	.member-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.member-card {
		background: var(--color-bg);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.member-card.expanded {
		border: 1px solid var(--color-primary);
	}

	.member-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		gap: var(--spacing-md);
	}

	.member-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.member-id {
		font-family: monospace;
		font-size: var(--font-size-sm);
	}

	.member-email {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.member-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.role-badge {
		font-size: var(--font-size-sm);
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-weight: 500;
		background: var(--color-border);
		color: var(--color-text);
	}

	.role-badge.owner {
		background: var(--color-primary);
		color: white;
	}

	.preset-form {
		display: inline-flex;
	}

	.preset-select {
		padding: var(--spacing-xs) var(--spacing-sm);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		cursor: pointer;
	}

	.expand-btn {
		padding: var(--spacing-xs) var(--spacing-sm);
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.expand-btn:hover {
		background: var(--color-bg);
	}

	.permissions-form {
		padding: var(--spacing-md);
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.permission-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-md);
	}

	.permission-section h4 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		margin-bottom: var(--spacing-xs);
		color: var(--color-text);
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-sm);
		cursor: pointer;
	}

	.checkbox-label input {
		cursor: pointer;
	}

	.permission-actions {
		display: flex;
		gap: var(--spacing-sm);
		justify-content: flex-end;
	}

	.invite-note {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-md);
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.invite-form {
		display: flex;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.invite-form .input {
		flex: 1;
		min-width: 200px;
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

	.invite-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.invite-email {
		font-size: var(--font-size-sm);
	}

	.invite-meta {
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

	.success-message {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: #16a34a;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		max-width: 400px;
		width: 90%;
	}

	.modal h3 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		margin-bottom: var(--spacing-md);
	}

	.modal p {
		margin-bottom: var(--spacing-md);
		color: var(--color-text);
	}

	.modal .warning {
		color: #dc2626;
		font-weight: 500;
	}

	.modal-actions {
		display: flex;
		gap: var(--spacing-sm);
		justify-content: flex-end;
	}

	/* Mobile styles */
	@media (max-width: 640px) {
		.member-row {
			flex-direction: column;
			align-items: flex-start;
		}

		.member-actions {
			width: 100%;
			flex-wrap: wrap;
		}

		.invite-form {
			flex-direction: column;
		}

		.invite-form .input {
			min-width: unset;
		}

		.permission-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
