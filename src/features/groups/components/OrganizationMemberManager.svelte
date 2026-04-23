<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatRelativeDate } from '$lib/utils/dates';
	import Badge from '$lib/components/ui/Badge.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { OrganizationMember, PermissionPreset } from '$lib/types';
	import { getPermissionPreset } from '$lib/types';
	import { sortMembers } from '$features/groups/utils/sortMembers';

	interface Invitation {
		id: string;
		email: string;
		status: string;
		createdAt: string;
		scopedGroupId?: string | null;
		canViewCalendar: boolean;
		canEditCalendar: boolean;
		canViewPersonnel: boolean;
		canEditPersonnel: boolean;
		canViewTraining: boolean;
		canEditTraining: boolean;
		canViewCriticalTasks: boolean;
		canEditCriticalTasks: boolean;
		canViewOnboarding: boolean;
		canEditOnboarding: boolean;
		canViewLeadersBook: boolean;
		canEditLeadersBook: boolean;
		canManageMembers: boolean;
	}

	interface Props {
		orgId: string;
		members: OrganizationMember[];
		invitations: Invitation[];
		isOwner: boolean;
		isAdmin: boolean;
		canManageMembers: boolean;
		groups: Array<{ id: string; name: string }>;
		form?: {
			error?: string;
			success?: boolean;
			deleteError?: string;
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

	let { members, invitations, isOwner, canManageMembers, groups, form }: Props = $props();

	const sortedMembers = $derived(sortMembers(members));

	let expandedMemberId = $state<string | null>(null);
	let inviteEmail = $state('');
	let invitePreset = $state<Exclude<PermissionPreset, 'owner' | 'custom'>>('full-editor');
	let showTransferConfirm = $state(false);
	let transferTargetId = $state<string | null>(null);
	let loading = $state(false);
	let pendingRemoveForm = $state<HTMLFormElement | null>(null);

	let inviteScopedGroupId = $state('');

	let memberSelectedPreset = $state<Record<string, string>>({});

	const presetOptions: { value: Exclude<PermissionPreset, 'owner' | 'custom'>; label: string }[] = [
		{ value: 'admin', label: 'Admin' },
		{ value: 'full-editor', label: 'Full Editor' },
		{ value: 'team-leader', label: 'Team Leader' },
		{ value: 'viewer', label: 'Viewer' }
	];

	// Filter preset options: only owners can assign/change admin
	const availablePresetOptions = $derived(isOwner ? presetOptions : presetOptions.filter((o) => o.value !== 'admin'));

	function getPresetLabel(preset: PermissionPreset): string {
		switch (preset) {
			case 'owner':
				return 'Owner';
			case 'admin':
				return 'Admin';
			case 'full-editor':
				return 'Full Editor';
			case 'viewer':
				return 'Viewer';
			case 'team-leader':
				return 'Team Leader';
			case 'custom':
				return 'Custom';
			default:
				return preset;
		}
	}

	function getMemberPreset(member: OrganizationMember): PermissionPreset {
		if (member.role === 'owner') return 'owner';
		return getPermissionPreset(
			{
				canViewCalendar: member.canViewCalendar,
				canEditCalendar: member.canEditCalendar,
				canViewPersonnel: member.canViewPersonnel,
				canEditPersonnel: member.canEditPersonnel,
				canViewTraining: member.canViewTraining,
				canEditTraining: member.canEditTraining,
				canViewCriticalTasks: member.canViewCriticalTasks,
				canEditCriticalTasks: member.canEditCriticalTasks,
				canViewOnboarding: member.canViewOnboarding,
				canEditOnboarding: member.canEditOnboarding,
				canViewLeadersBook: member.canViewLeadersBook,
				canEditLeadersBook: member.canEditLeadersBook,
				canManageMembers: member.canManageMembers
			},
			member.scopedGroupId
		);
	}

	function toggleExpanded(memberId: string) {
		if (expandedMemberId === memberId) {
			expandedMemberId = null;
		} else {
			expandedMemberId = memberId;
		}
	}

	function getInvitePreset(invite: Invitation): PermissionPreset {
		return getPermissionPreset(
			{
				canViewCalendar: invite.canViewCalendar,
				canEditCalendar: invite.canEditCalendar,
				canViewPersonnel: invite.canViewPersonnel,
				canEditPersonnel: invite.canEditPersonnel,
				canViewTraining: invite.canViewTraining,
				canEditTraining: invite.canEditTraining,
				canViewCriticalTasks: invite.canViewCriticalTasks,
				canEditCriticalTasks: invite.canEditCriticalTasks,
				canViewOnboarding: invite.canViewOnboarding,
				canEditOnboarding: invite.canEditOnboarding,
				canViewLeadersBook: invite.canViewLeadersBook,
				canEditLeadersBook: invite.canEditLeadersBook,
				canManageMembers: invite.canManageMembers
			},
			invite.scopedGroupId
		);
	}

	let memberSelectedGroupId = $state<Record<string, string>>({});

	function handlePresetChange(memberId: string, preset: string) {
		// Close expanded view when selecting a non-expandable preset
		if (preset !== 'custom' && preset !== 'team-leader') {
			expandedMemberId = null;
		}
	}
</script>

<div class="member-manager">
	<div class="section">
		<h2>Organization Members</h2>
		<div class="member-list">
			{#each sortedMembers as member (member.id)}
				{@const preset = getMemberPreset(member)}
				<div class="member-card" class:expanded={expandedMemberId === member.id}>
					<div class="member-row">
						<div class="member-info">
							<div class="member-name-row">
								{#if member.email}
									<span class="member-email">{member.email}</span>
								{:else}
									<span class="member-id">{member.userId.slice(0, 8)}...</span>
								{/if}
								{#if member.role === 'owner'}
									<Badge label="OWNER" color="var(--amber-dark)" />
								{:else if member.role === 'admin'}
									<Badge label="ADMIN" color="var(--info)" bold={true} />
								{:else}
									<Badge label="MEMBER" color="var(--ink-60)" />
								{/if}
								{#if member.scopedGroupId}
									<span class="scope-label"
										>({groups.find((g) => g.id === member.scopedGroupId)?.name ?? 'Unknown group'})</span
									>
								{/if}
							</div>
						</div>

						<div class="member-actions">
							{#if member.role === 'owner'}
								<!-- Owner: no actions -->
							{:else if canManageMembers && (member.role !== 'admin' || isOwner)}
								<form
									method="POST"
									action="?/updatePermissions"
									class="preset-form"
									use:enhance={() => {
										loading = true;
										return async ({ update }) => {
											loading = false;
											delete memberSelectedPreset[member.id];
											delete memberSelectedGroupId[member.id];
											await update();
										};
									}}
								>
									<input type="hidden" name="membershipId" value={member.id} />
									<select
										name="preset"
										class="preset-select"
										value={memberSelectedPreset[member.id] ?? (preset === 'custom' ? 'custom' : preset)}
										onchange={(e) => {
											const val = e.currentTarget.value;
											memberSelectedPreset = { ...memberSelectedPreset, [member.id]: val };
											handlePresetChange(member.id, val);
											if (val === 'custom' || val === 'team-leader') {
												expandedMemberId = member.id;
											} else {
												e.currentTarget.form?.requestSubmit();
											}
										}}
									>
										{#each availablePresetOptions as option (option.value)}
											<option value={option.value}>{option.label}</option>
										{/each}
										{#if preset === 'custom'}
											<option value="custom">Custom</option>
										{/if}
									</select>
									{#if (memberSelectedPreset[member.id] === 'team-leader' || (preset === 'team-leader' && !memberSelectedPreset[member.id])) && expandedMemberId === member.id}
										<select
											name="scopedGroupId"
											class="preset-select"
											value={memberSelectedGroupId[member.id] ?? member.scopedGroupId ?? ''}
											onchange={(e) => {
												memberSelectedGroupId = { ...memberSelectedGroupId, [member.id]: e.currentTarget.value };
											}}
										>
											<option value="">Select group...</option>
											{#each groups as group (group.id)}
												<option value={group.id}>{group.name}</option>
											{/each}
										</select>
										<button type="submit" class="btn btn-primary btn-sm">Apply</button>
									{/if}
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
										type="button"
										class="btn btn-danger btn-sm"
										onclick={(e) => {
											pendingRemoveForm = (e.target as HTMLElement).closest('form');
										}}
									>
										Remove
									</button>
								</form>
							{:else}
								<Badge label={getPresetLabel(preset)} variant="outlined" />
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
									<p class="permission-description">
										View the unit calendar and personnel statuses. Edit allows setting statuses, assignments, and
										availability.
									</p>
									<label class="checkbox-label">
										<input type="checkbox" name="canViewCalendar" checked={member.canViewCalendar} />
										View
									</label>
									<label class="checkbox-label">
										<input type="checkbox" name="canEditCalendar" checked={member.canEditCalendar} />
										Edit
									</label>
								</div>

								<div class="permission-section">
									<h4>Personnel</h4>
									<p class="permission-description">
										View the personnel roster and details. Edit allows adding, updating, and removing personnel records.
									</p>
									<label class="checkbox-label">
										<input type="checkbox" name="canViewPersonnel" checked={member.canViewPersonnel} />
										View
									</label>
									<label class="checkbox-label">
										<input type="checkbox" name="canEditPersonnel" checked={member.canEditPersonnel} />
										Edit
									</label>
								</div>

								<div class="permission-section">
									<h4>Training</h4>
									<p class="permission-description">
										View training records and compliance status. Edit allows logging training completions and managing
										records.
									</p>
									<label class="checkbox-label">
										<input type="checkbox" name="canViewTraining" checked={member.canViewTraining} />
										View
									</label>
									<label class="checkbox-label">
										<input type="checkbox" name="canEditTraining" checked={member.canEditTraining} />
										Edit
									</label>
								</div>

								<div class="permission-section">
									<h4>Critical Tasks</h4>
									<p class="permission-description">
										View the ICTL matrix and reports. Edit allows recording ICT completions and maintaining critical
										task readiness.
									</p>
									<label class="checkbox-label">
										<input type="checkbox" name="canViewCriticalTasks" checked={member.canViewCriticalTasks} />
										View
									</label>
									<label class="checkbox-label">
										<input type="checkbox" name="canEditCriticalTasks" checked={member.canEditCriticalTasks} />
										Edit
									</label>
								</div>

								<div class="permission-section">
									<h4>Onboarding</h4>
									<p class="permission-description">
										View onboarding progress for new personnel. Edit allows starting onboardings and updating step
										progress.
									</p>
									<label class="checkbox-label">
										<input type="checkbox" name="canViewOnboarding" checked={member.canViewOnboarding} />
										View
									</label>
									<label class="checkbox-label">
										<input type="checkbox" name="canEditOnboarding" checked={member.canEditOnboarding} />
										Edit
									</label>
								</div>

								<div class="permission-section">
									<h4>Leader's Book</h4>
									<p class="permission-description">
										View counseling records and development goals. Edit allows creating and updating counseling entries.
									</p>
									<label class="checkbox-label">
										<input type="checkbox" name="canViewLeadersBook" checked={member.canViewLeadersBook} />
										View
									</label>
									<label class="checkbox-label">
										<input type="checkbox" name="canEditLeadersBook" checked={member.canEditLeadersBook} />
										Edit
									</label>
								</div>

								<div class="permission-section">
									<h4>Members</h4>
									<p class="permission-description">
										Invite, remove, and manage permissions for other organization members.
									</p>
									<label class="checkbox-label">
										<input type="checkbox" name="canManageMembers" checked={member.canManageMembers} />
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
					Note: There are no email notifications. The invited user needs to log in to Troop to Task to see and accept
					their invitation.
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
						{#each availablePresetOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
					{#if invitePreset === 'team-leader'}
						<select name="scopedGroupId" class="preset-select" bind:value={inviteScopedGroupId}>
							<option value="">Select group...</option>
							{#each groups as group (group.id)}
								<option value={group.id}>{group.name}</option>
							{/each}
						</select>
					{/if}
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
					{#each invitations as invite (invite.id)}
						{@const invitePreset = getInvitePreset(invite)}
						<div class="invitation-item">
							<div class="invite-info">
								<span class="invite-email">{invite.email}</span>
								<span class="invite-meta">
									{getPresetLabel(invitePreset)} - Sent {formatRelativeDate(invite.createdAt)}
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
		<Modal
			title="Transfer Ownership"
			onClose={() => (showTransferConfirm = false)}
			width="400px"
			titleId="transfer-ownership-title"
		>
			<p>
				Are you sure you want to transfer ownership of this organization? You will become an Admin member and lose owner
				privileges.
			</p>
			<p class="warning">This action cannot be undone by you.</p>

			{#if form?.transferError}
				<div class="error-message">{form.transferError}</div>
			{/if}

			<form
				id="transfer-ownership-form"
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
			</form>

			{#snippet footer()}
				<button type="button" class="btn btn-secondary" onclick={() => (showTransferConfirm = false)}> Cancel </button>
				<button type="submit" form="transfer-ownership-form" class="btn btn-danger" disabled={loading}>
					{loading ? 'Transferring...' : 'Transfer Ownership'}
				</button>
			{/snippet}
		</Modal>
	{/if}
</div>

{#if pendingRemoveForm}
	<ConfirmDialog
		title="Remove Member"
		message="Remove this member from the organization?"
		confirmLabel="Remove"
		variant="danger"
		onConfirm={() => {
			pendingRemoveForm?.requestSubmit();
			pendingRemoveForm = null;
		}}
		onCancel={() => (pendingRemoveForm = null)}
	/>
{/if}

<style>
	.member-manager {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.section {
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		padding: var(--sp-5);
	}

	.section h2 {
		margin: 0 0 var(--sp-4);
		font-family: var(--font-display);
		font-size: clamp(1.9rem, 3vw, 2.5rem);
		line-height: 0.98;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.member-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.member-card {
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.member-card.expanded {
		border-color: var(--amber);
	}

	.member-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-3) var(--sp-4);
		gap: var(--sp-4);
	}

	.member-info {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.member-name-row {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.scope-label {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		margin-left: 4px;
	}

	.member-id {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	.member-email {
		font-size: var(--text-sm);
		color: var(--text-strong);
	}

	.member-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.preset-form {
		display: inline-flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.preset-select {
		padding: 0.625rem 0.8rem;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--field-bg);
		color: var(--text-strong);
		font-size: var(--text-sm);
		cursor: pointer;
		min-height: 2.5rem;
	}

	.expand-btn {
		padding: 0.625rem 0.8rem;
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		cursor: pointer;
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
		min-height: 2.5rem;
	}

	.expand-btn:hover {
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.permissions-form {
		padding: var(--sp-4);
		border-top: var(--border-thin);
		background: var(--surface-panel);
	}

	.permission-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
	}

	.permission-section {
		padding: var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 68%, var(--surface-panel) 32%);
	}

	.permission-section h4 {
		font-size: var(--text-sm);
		font-family: var(--font-mono);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		margin-bottom: var(--sp-2);
		color: var(--text-strong);
	}

	.permission-description {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		margin: 0 0 var(--sp-2);
		line-height: 1.5;
	}

	/* .checkbox-label base in app.css */

	.checkbox-label input {
		cursor: pointer;
	}

	.permission-actions {
		display: flex;
		gap: var(--sp-3);
		justify-content: flex-end;
	}

	.invite-note {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin-bottom: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		background: color-mix(in srgb, var(--amber-light) 84%, var(--surface-panel) 16%);
		border: var(--border-thin);
		border-radius: var(--radius-md);
	}

	.invite-form {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.invite-form .input {
		flex: 1;
		min-width: 200px;
	}

	.invitation-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.invitation-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-3) var(--sp-4);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		gap: var(--sp-3);
	}

	.invite-info {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.invite-email {
		font-size: var(--text-sm);
		color: var(--text-strong);
	}

	.invite-meta {
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.error-message {
		background: color-mix(in srgb, var(--danger-bg) 84%, var(--surface-panel) 16%);
		border: var(--border-thin);
		color: var(--danger);
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		margin-top: var(--sp-3);
	}

	.success-message {
		background: color-mix(in srgb, var(--success-bg) 84%, var(--surface-panel) 16%);
		border: var(--border-thin);
		color: var(--success);
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		margin-top: var(--sp-3);
	}

	.warning {
		color: var(--danger);
		font-weight: 500;
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

		.invitation-item,
		.permission-actions {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
