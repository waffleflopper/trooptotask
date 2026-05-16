<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatRelativeDate } from '$lib/utils/dates';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
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
		canViewRatingScheme: boolean;
		canEditRatingScheme: boolean;
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
			nameSuccess?: boolean;
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
				canViewRatingScheme: member.canViewRatingScheme,
				canEditRatingScheme: member.canEditRatingScheme,
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
				canViewRatingScheme: invite.canViewRatingScheme,
				canEditRatingScheme: invite.canEditRatingScheme,
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

	function roleVariant(role: OrganizationMember['role']) {
		if (role === 'owner') return 'warning';
		if (role === 'admin') return 'info';
		return 'secondary';
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
								<Badge
									variant={roleVariant(member.role)}
									class={['font-mono tracking-widest uppercase', member.role === 'admin' && 'font-bold']}
								>
									{member.role}
								</Badge>
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
										<Button type="submit" size="sm">Apply</Button>
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
									<Button
										type="button"
										variant="destructive"
										size="sm"
										onclick={(e) => {
											pendingRemoveForm = e.currentTarget.closest('form');
										}}
									>
										Remove
									</Button>
								</form>
							{:else}
								<Badge variant="outline" class="font-mono tracking-widest uppercase">{getPresetLabel(preset)}</Badge>
							{/if}

							{#if isOwner && member.role !== 'owner'}
								<Button
									type="button"
									variant="outline"
									size="sm"
									onclick={() => {
										transferTargetId = member.userId;
										showTransferConfirm = true;
									}}
								>
									Transfer
								</Button>
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
									<label class="permission-checkbox-label">
										<input type="checkbox" name="canViewCalendar" checked={member.canViewCalendar} />
										View
									</label>
									<label class="permission-checkbox-label">
										<input type="checkbox" name="canEditCalendar" checked={member.canEditCalendar} />
										Edit
									</label>
								</div>

								<div class="permission-section">
									<h4>Personnel</h4>
									<p class="permission-description">
										View the personnel roster and details. Operators can update existing records; editors manage new
										personnel, imports, groups, and archive actions.
									</p>
									<label class="permission-checkbox-label">
										<input type="checkbox" name="canViewPersonnel" checked={member.canViewPersonnel} />
										View
									</label>
									<label class="permission-checkbox-label">
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
									<label class="permission-checkbox-label">
										<input type="checkbox" name="canViewTraining" checked={member.canViewTraining} />
										View
									</label>
									<label class="permission-checkbox-label">
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
									<label class="permission-checkbox-label">
										<input type="checkbox" name="canViewCriticalTasks" checked={member.canViewCriticalTasks} />
										View
									</label>
									<label class="permission-checkbox-label">
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
									<label class="permission-checkbox-label">
										<input type="checkbox" name="canViewOnboarding" checked={member.canViewOnboarding} />
										View
									</label>
									<label class="permission-checkbox-label">
										<input type="checkbox" name="canEditOnboarding" checked={member.canEditOnboarding} />
										Edit
									</label>
								</div>

								<div class="permission-section">
									<h4>Rating Scheme</h4>
									<p class="permission-description">
										View evaluation-tracking records and workflow status. Edit allows creating and updating rating
										scheme entries.
									</p>
									<label class="permission-checkbox-label">
										<input type="checkbox" name="canViewRatingScheme" checked={member.canViewRatingScheme} />
										View
									</label>
									<label class="permission-checkbox-label">
										<input type="checkbox" name="canEditRatingScheme" checked={member.canEditRatingScheme} />
										Edit
									</label>
								</div>

								<div class="permission-section">
									<h4>Members</h4>
									<p class="permission-description">
										Invite, remove, and manage permissions for other organization members.
									</p>
									<label class="permission-checkbox-label">
										<input type="checkbox" name="canManageMembers" checked={member.canManageMembers} />
										Manage
									</label>
								</div>
							</div>

							<div class="permission-actions">
								<Button type="button" variant="outline" onclick={() => (expandedMemberId = null)}>Cancel</Button>
								<Button type="submit" disabled={loading}>
									{loading ? 'Saving...' : 'Save Permissions'}
								</Button>
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
					<Input name="email" type="email" placeholder="colleague@example.com" bind:value={inviteEmail} required />
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
					<Button type="submit" disabled={loading}>
						{loading ? 'Sending...' : 'Invite'}
					</Button>
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
								<Button type="submit" variant="outline" size="sm">Revoke</Button>
							</form>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}

	{#if showTransferConfirm && transferTargetId}
		<AppDialog.Root open closeBlocked={loading} onClose={() => (showTransferConfirm = false)}>
			<AppDialog.Content closeBlocked={loading}>
				<AppDialog.Header>
					<AppDialog.Title id="transfer-ownership-title">Transfer Ownership</AppDialog.Title>
					<AppDialog.Description>
						You will become an Admin member and lose owner privileges. This action cannot be undone by you.
					</AppDialog.Description>
				</AppDialog.Header>

				<AppDialog.Body>
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
				</AppDialog.Body>

				<AppDialog.Footer>
					<Button type="button" variant="outline" onclick={() => (showTransferConfirm = false)} disabled={loading}>
						Cancel
					</Button>
					<Button type="submit" form="transfer-ownership-form" variant="destructive" disabled={loading}>
						{loading ? 'Transferring...' : 'Transfer Ownership'}
					</Button>
				</AppDialog.Footer>
			</AppDialog.Content>
		</AppDialog.Root>
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
		gap: 1rem;
	}

	.section {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.25rem;
	}

	.section h2 {
		margin: 0 0 1rem;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(1.9rem, 3vw, 2.5rem);
		line-height: 0.98;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--foreground);
	}

	.member-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.member-card {
		background: color-mix(in srgb, var(--muted) 72%, var(--card) 28%);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.member-card.expanded {
		border-color: var(--accent);
	}

	.member-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		gap: 1rem;
	}

	.member-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.member-name-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.scope-label {
		font-size: 0.6875rem;
		color: var(--muted-foreground);
		margin-left: 4px;
	}

	.member-id {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.8125rem;
	}

	.member-email {
		font-size: 0.8125rem;
		color: var(--foreground);
	}

	.member-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.preset-form {
		display: inline-flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.preset-select {
		padding: 0.625rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
		color: var(--foreground);
		font-size: 0.8125rem;
		cursor: pointer;
		min-height: 2.5rem;
	}

	.expand-btn {
		padding: 0.625rem 0.8rem;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		font-size: 0.6875rem;
		font-family: 'IBM Plex Mono', monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		min-height: 2.5rem;
	}

	.expand-btn:hover {
		background: color-mix(in srgb, var(--muted) 72%, var(--card) 28%);
	}

	.permissions-form {
		padding: 1rem;
		border-top: 1px solid var(--border);
		background: var(--card);
	}

	.permission-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.permission-section {
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--muted) 68%, var(--card) 32%);
	}

	.permission-section h4 {
		font-size: 0.8125rem;
		font-family: 'IBM Plex Mono', monospace;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		margin-bottom: 0.5rem;
		color: var(--foreground);
	}

	.permission-description {
		font-size: 0.6875rem;
		color: var(--muted-foreground);
		margin: 0 0 0.5rem;
		line-height: 1.5;
	}

	/* .permission-checkbox-label base in app.css */

	.permission-checkbox-label input {
		cursor: pointer;
	}

	.permission-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}

	.invite-note {
		font-size: 0.8125rem;
		color: var(--muted-foreground);
		margin-bottom: 1rem;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--accent) 14%, var(--card));
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.invite-form {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.invite-form :global([data-slot='input']) {
		flex: 1;
		min-width: 200px;
	}

	.invitation-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.invitation-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--muted) 72%, var(--card) 28%);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		gap: 0.75rem;
	}

	.invite-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.invite-email {
		font-size: 0.8125rem;
		color: var(--foreground);
	}

	.invite-meta {
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}

	.error-message {
		background: color-mix(in srgb, var(--destructive) 12%, var(--card));
		border: 1px solid var(--border);
		color: var(--destructive);
		padding: 0.75rem 1rem;
		border-radius: var(--radius);
		font-size: 0.8125rem;
		margin-top: 0.75rem;
	}

	.success-message {
		background: color-mix(in srgb, var(--chart-2) 12%, var(--card));
		border: 1px solid var(--border);
		color: var(--chart-2);
		padding: 0.75rem 1rem;
		border-radius: var(--radius);
		font-size: 0.8125rem;
		margin-top: 0.75rem;
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

		.invite-form :global([data-slot='input']) {
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
