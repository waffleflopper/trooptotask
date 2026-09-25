<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import { Edit, RefreshCw, Search, Trash2 } from '@lucide/svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { explainPolicyReasonCode } from '$lib/access/policyDecisionExplanations';
	import { redirectToSensitiveActionStepUp } from '$features/identity';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { formatRelativeDate } from '$lib/utils/dates';
	import {
		createSettingsMemberAccessWorkspace,
		type EditableMembershipRole,
		type EditablePreset
	} from '../settingsMemberAccessWorkspace.svelte';
	import type { MembersSettingsSection } from './membersSettings.server';
	import type { SettingsMemberAccessRow } from '../settingsMemberAccessModel';
	import type { SettingsInvitationFunnelStatus } from '../settingsSectionTypes';
	import { pluralize } from '../settingsWorkspaceFormatters';

	let { data, form }: PageProps = $props();

	let inviteLoading = $state(false);
	let accessLoading = $state(false);
	let memberSearch = $state('');
	let pendingRemoveMemberForm = $state<HTMLFormElement | null>(null);
	let pendingRemoveMemberEmail = $state('');

	const membersSection = $derived(data.membersSettings.sections.members);
	const currentMember = $derived(data.membersSettings.currentMember);
	const isOwner = $derived(currentMember.isOwner);
	const memberAccess = createSettingsMemberAccessWorkspace(() => ({
		members: membersSection.rows,
		invitations: membersSection.invitations,
		groups: membersSection.groups,
		isOwner
	}));
	const sortedMembers = $derived(memberAccess.sortedMembers);
	const filteredMembers = $derived(
		memberSearch.trim()
			? sortedMembers.filter((m) => (m.email ?? '').toLowerCase().includes(memberSearch.trim().toLowerCase()))
			: sortedMembers
	);
	const availablePresetOptions = $derived(memberAccess.availablePresetOptions);
	const availableMembershipRoleOptions = $derived(memberAccess.availableMembershipRoleOptions);
	const selectedMember = $derived(sortedMembers.find((member) => member.id === memberAccess.memberEditorId) ?? null);
	const accessLanes = memberAccess.accessLanes;
	const capabilityOptions = memberAccess.capabilityOptions;
	const governanceRoleExplanation = explainPolicyReasonCode('denied:governance-role');
	const sessionEmail = $derived((data.session as { user?: { email?: string | null } } | null | undefined)?.user?.email);

	const stepUpEnhance: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) return;
			await update();
		};
	};

	function isCurrentMember(member: SettingsMemberAccessRow): boolean {
		return Boolean(sessionEmail && member.email === sessionEmail);
	}

	function getPresetLabel(value: string | null | undefined): string {
		return availablePresetOptions.find((option) => option.value === value)?.label ?? 'Select access level';
	}

	function getCapabilityLabel(value: string): string {
		return capabilityOptions.find((option) => option.value === value)?.label ?? value;
	}

	function getFunnelStatusVariant(status: SettingsInvitationFunnelStatus): 'danger' | 'secondary' {
		return status === 'invitation_email_failed' || status === 'setup_email_failed' ? 'danger' : 'secondary';
	}
</script>

<section class="grid gap-4" aria-labelledby="members-settings-heading">
	<div class="grid gap-1">
		<h2 id="members-settings-heading" class="text-xl font-semibold tracking-tight">Access Management</h2>
		<p class="max-w-3xl text-sm text-muted-foreground">
			Set each member's role and day-to-day access. Admin authority is separate from member access.
			{governanceRoleExplanation}
		</p>
	</div>

	{#if membersSection.canInvite}
		<section
			class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
			aria-labelledby="invite-member-heading"
		>
			<div class="grid gap-1">
				<h3 id="invite-member-heading" class="text-lg font-semibold tracking-tight">Invite Member</h3>
				<p class="text-sm text-muted-foreground">Create an invite they can accept after signing in.</p>
			</div>
			<form
				method="POST"
				action="?/invite"
				use:enhance={() => {
					inviteLoading = true;
					return async ({ result, update }) => {
						try {
							if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) return;
							await update();
							if (result.type === 'success') memberAccess.clearInviteEmail();
						} finally {
							inviteLoading = false;
						}
					};
				}}
			>
				{#if form?.inviteError}<p class="text-sm text-destructive">{form.inviteError}</p>{/if}
				{#if form?.inviteSuccess}<p class="text-sm text-muted-foreground">
						{form.inviteMessage ?? 'Invitation created.'}
					</p>{/if}
				<input type="hidden" name="membershipRole" value={memberAccess.inviteMembershipRole} />
				<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_14rem_auto]">
					<div class="grid gap-2">
						<Label for="invite-email">Email address</Label>
						<Input id="invite-email" name="email" type="email" bind:value={memberAccess.inviteEmail} required />
					</div>
					{#if isOwner}
						<Field.Root>
							<Field.Label id="invite-membership-role-label">Membership Role</Field.Label>
							<Select.Root
								type="single"
								value={memberAccess.inviteMembershipRole}
								onValueChange={(value) => memberAccess.setInviteMembershipRole(value as EditableMembershipRole)}
							>
								<Select.Trigger aria-labelledby="invite-membership-role-label" class="w-full">
									{memberAccess.getGovernanceRoleLabel(memberAccess.inviteMembershipRole)}
								</Select.Trigger>
								<Select.Content>
									{#each availableMembershipRoleOptions as option (option.value)}
										<Select.Item value={option.value} label={option.label} />
									{/each}
								</Select.Content>
							</Select.Root>
						</Field.Root>
					{/if}
					<Field.Root>
						<Field.Label id="invite-access-level-label">Member Preset</Field.Label>
						{#if memberAccess.inviteMembershipRole === 'member'}
							<input type="hidden" name="memberPreset" value={memberAccess.invitePreset} />
							<Select.Root type="single" bind:value={memberAccess.invitePreset}>
								<Select.Trigger aria-labelledby="invite-access-level-label" class="w-full">
									{getPresetLabel(memberAccess.invitePreset)}
								</Select.Trigger>
								<Select.Content>
									{#each availablePresetOptions as option (option.value)}
										<Select.Item value={option.value} label={option.label} />
									{/each}
								</Select.Content>
							</Select.Root>
						{:else}
							<p class="rounded-md border bg-background px-3 py-2 text-sm">Uses Admin authority</p>
						{/if}
					</Field.Root>
					<div class="flex items-end">
						<Button type="submit" disabled={inviteLoading}>{inviteLoading ? 'Inviting...' : 'Invite'}</Button>
					</div>
				</div>
				{#if memberAccess.inviteMembershipRole === 'member'}
					<div class="mt-4 grid gap-3 rounded-md border bg-muted/30 p-3">
						<input type="hidden" name="scopeSetKind" value={memberAccess.inviteScopeKind} />
						<RadioGroup.Root
							value={memberAccess.inviteScopeKind}
							onValueChange={(value) => memberAccess.setInviteScopeKind(value as 'organization' | 'groups')}
							class="sm:grid-cols-2"
						>
							<Field.Root orientation="horizontal">
								<RadioGroup.Item id="invite-scope-all" value="organization" />
								<Field.Label for="invite-scope-all">All groups</Field.Label>
							</Field.Root>
							<Field.Root orientation="horizontal">
								<RadioGroup.Item id="invite-scope-groups" value="groups" />
								<Field.Label for="invite-scope-groups">Selected groups</Field.Label>
							</Field.Root>
						</RadioGroup.Root>
						{#if memberAccess.inviteScopeKind === 'groups'}
							<div class="grid gap-2">
								{#each membersSection.groups as group (group.id)}
									{@const checked = memberAccess.inviteScopeGroupIds.includes(group.id)}
									{#if checked}<input type="hidden" name="scopeSetGroupIds" value={group.id} />{/if}
									<Field.Root orientation="horizontal">
										<Checkbox
											id="invite-scope-group-{group.id}"
											{checked}
											onCheckedChange={(value) => memberAccess.toggleInviteScopeGroup(group.id, value === true)}
										/>
										<Field.Label for="invite-scope-group-{group.id}">{group.name}</Field.Label>
									</Field.Root>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</form>
		</section>
	{/if}

	<div class="rounded-lg border bg-card text-card-foreground">
		<div class="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
			<div>
				<h3 class="font-medium">Organization members</h3>
				<p class="text-sm text-muted-foreground">
					{membersSection.rows.length}
					{pluralize('member', membersSection.rows.length)}
				</p>
			</div>
			<div class="flex items-center gap-3">
				<div class="relative">
					<Label for="member-filter" class="sr-only">Filter members</Label>
					<Search class="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						id="member-filter"
						type="search"
						placeholder="Filter members..."
						class="h-8 w-48 pl-8 text-sm"
						bind:value={memberSearch}
					/>
				</div>
				<Badge variant="outline">{membersSection.invitations.length} pending invitations</Badge>
			</div>
		</div>

		<div class="divide-y">
			{#each filteredMembers as member (member.id)}
				{@const accessShape = memberAccess.getMemberAccessShape(member)}
				{@const accessBadge = memberAccess.getMemberAccessBadge(member, accessShape)}
				{@const overrides = (member as MembersSettingsSection['rows'][number]).overriddenCapabilityLabels}
				<div class="grid gap-3 p-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
					<div
						class="flex size-10 items-center justify-center rounded-md border bg-muted text-sm font-medium"
						aria-hidden="true"
					>
						{memberAccess.getMemberInitials(member.email)}
					</div>
					<div class="min-w-0 grid gap-2">
						<div class="min-w-0">
							<p class="truncate font-medium">{member.email ?? `${member.userId.slice(0, 8)}...`}</p>
							<p class="truncate text-sm text-muted-foreground">{memberAccess.formatScopeSet(accessShape.scopeSet)}</p>
						</div>
						<div class="flex flex-wrap gap-2">
							<Badge variant="secondary">{memberAccess.getAccessLabel(accessBadge)}</Badge>
							{#each overrides as override (override)}
								<Badge variant="outline">{override}</Badge>
							{/each}
							{#if overrides.length === 0 && member.membershipRole !== 'owner' && member.membershipRole !== 'admin'}
								<Badge variant="outline">Preset defaults</Badge>
							{/if}
							{#if isCurrentMember(member)}<Badge>You</Badge>{/if}
						</div>
					</div>
					<div class="flex flex-wrap justify-end gap-2">
						{#if member.membershipRole !== 'owner' && membersSection.canManageMemberAccess && (member.membershipRole !== 'admin' || isOwner)}
							<Button type="button" variant="outline" size="sm" onclick={() => memberAccess.openMemberEditor(member)}>
								<Edit />
								{isOwner ? 'Manage role & access' : 'Manage access'}
							</Button>
							<form method="POST" action="?/removeMember" use:enhance={stepUpEnhance}>
								<input type="hidden" name="membershipId" value={member.id} />
								<Button
									type="button"
									variant="destructive"
									size="sm"
									onclick={(event) => {
										pendingRemoveMemberForm = (event.currentTarget as HTMLButtonElement).closest('form');
										pendingRemoveMemberEmail = member.email ?? 'this member';
									}}
								>
									<Trash2 />
									Remove
								</Button>
							</form>
						{/if}
					</div>
				</div>
			{:else}
				<div class="p-4 text-center text-sm text-muted-foreground">
					{#if memberSearch.trim()}
						No members matching "{memberSearch.trim()}"
					{:else}
						No members found
					{/if}
				</div>
			{/each}
		</div>
	</div>

	{#if form?.memberError}<p class="text-sm text-destructive">{form.memberError}</p>{/if}
	{#if form?.accessError}<p class="text-sm text-destructive">{form.accessError}</p>{/if}
	{#if form?.accessSuccess}<p class="text-sm text-muted-foreground">Access updated.</p>{/if}

	{#if membersSection.invitations.length > 0}
		<section
			class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
			aria-labelledby="pending-invites-heading"
		>
			<div class="flex items-center justify-between gap-3">
				<h3 id="pending-invites-heading" class="text-lg font-semibold tracking-tight">Pending Invitations</h3>
				<Badge variant="outline">{membersSection.invitations.length} Pending</Badge>
			</div>
			<div class="divide-y rounded-md border">
				{#each membersSection.invitations as invite (invite.id)}
					{@const invitePermissionPreset = memberAccess.getInvitePreset(invite)}
					<div class="flex flex-col gap-3 p-3 md:flex-row md:items-start md:justify-between">
						<div class="min-w-0 grid gap-1.5">
							<p class="truncate font-medium">{invite.email}</p>
							<p class="text-sm text-muted-foreground">
								{memberAccess.getAccessLabel(invitePermissionPreset)} · Sent {formatRelativeDate(invite.createdAt)}
							</p>
							<div class="grid gap-1">
								<Badge variant={getFunnelStatusVariant(invite.funnelStatus)}>{invite.funnelStatusLabel}</Badge>
								<p class="text-sm text-muted-foreground">{invite.funnelStatusDetail}</p>
							</div>
						</div>
						<div class="flex flex-wrap gap-2">
							<form method="POST" action="?/resendInvite" use:enhance={stepUpEnhance}>
								<input type="hidden" name="inviteId" value={invite.id} />
								<!-- Resend stays enabled in every funnel state; it is insufficient in some, never futile. -->
								<Button type="submit" variant="outline" size="sm">
									<RefreshCw />
									Resend
								</Button>
							</form>
							<form method="POST" action="?/revokeInvite" use:enhance={stepUpEnhance}>
								<input type="hidden" name="inviteId" value={invite.id} />
								<Button type="submit" variant="outline" size="sm">Revoke</Button>
							</form>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if membersSection.invitationHistory.length > 0}
		<section
			class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
			aria-labelledby="invitation-history-heading"
		>
			<div class="flex items-center justify-between gap-3">
				<h3 id="invitation-history-heading" class="text-lg font-semibold tracking-tight">Invitation History</h3>
				<Badge variant="secondary">{membersSection.invitationHistory.length} Closed</Badge>
			</div>
			<div class="divide-y rounded-md border">
				{#each membersSection.invitationHistory as invite (invite.id)}
					{@const invitePermissionPreset = memberAccess.getInvitePreset(invite)}
					<div class="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
						<div class="min-w-0">
							<p class="truncate font-medium">{invite.email}</p>
							<p class="text-sm text-muted-foreground">
								{memberAccess.getAccessLabel(invitePermissionPreset)} · {invite.lifecycleStatusLabel}
								{formatRelativeDate(invite.lifecycleAt)}
							</p>
						</div>
						<Badge variant="outline">{invite.lifecycleStatusLabel}</Badge>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</section>

<Sheet.Root
	open={Boolean(selectedMember)}
	onOpenChange={(open) => {
		if (!open && selectedMember) memberAccess.closeMemberEditor(selectedMember.id);
	}}
>
	{#if selectedMember}
		{@const selectedMembershipRole = memberAccess.getSelectedMembershipRole(selectedMember)}
		{@const selectedPreset = memberAccess.getSelectedPreset(selectedMember)}
		{@const selectedScopeKind = memberAccess.getSelectedScopeKind(selectedMember)}
		{@const selectedScopeGroupIds = memberAccess.getSelectedScopeGroupIds(selectedMember)}
		{@const changeCount = memberAccess.editorChangeCount(selectedMember)}
		<Sheet.Content class="w-full overflow-y-auto sm:max-w-xl">
			<Sheet.Header>
				<Sheet.Title>Manage Access</Sheet.Title>
				<Sheet.Description>{selectedMember.email ?? 'Selected member'}</Sheet.Description>
			</Sheet.Header>
			<form
				method="POST"
				action="?/updateMemberAccess"
				class="grid gap-5 px-4 pb-4"
				use:enhance={() => {
					accessLoading = true;
					return async ({ result, update }) => {
						try {
							if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) return;
							await update();
							if (result.type === 'success') memberAccess.closeMemberEditor(selectedMember.id);
						} finally {
							accessLoading = false;
						}
					};
				}}
			>
				<input type="hidden" name="membershipId" value={selectedMember.id} />
				<input type="hidden" name="membershipRole" value={selectedMembershipRole} />
				<Field.Root>
					<Field.Label id="membership-role-label-{selectedMember.id}">Membership Role</Field.Label>
					{#if isOwner}
						<Select.Root
							type="single"
							value={selectedMembershipRole}
							onValueChange={(value) =>
								memberAccess.setMemberMembershipRole(selectedMember.id, value as EditableMembershipRole)}
						>
							<Select.Trigger aria-labelledby="membership-role-label-{selectedMember.id}" class="w-full">
								{memberAccess.getGovernanceRoleLabel(selectedMembershipRole)}
							</Select.Trigger>
							<Select.Content>
								{#each availableMembershipRoleOptions as option (option.value)}
									<Select.Item value={option.value} label={option.label} />
								{/each}
							</Select.Content>
						</Select.Root>
					{:else}
						<p class="rounded-md border bg-background px-3 py-2 text-sm">
							{memberAccess.getGovernanceRoleLabel(selectedMembershipRole)}
						</p>
					{/if}
					<Field.Description>{memberAccess.getGovernanceRoleHelper(selectedMembershipRole)}</Field.Description>
				</Field.Root>

				{#if selectedMembershipRole === 'member'}
					<Field.Root>
						<Field.Label id="access-level-label-{selectedMember.id}">Member Preset</Field.Label>
						<input type="hidden" name="memberPreset" value={selectedPreset} />
						<Select.Root
							type="single"
							value={selectedPreset}
							onValueChange={(value) => memberAccess.setMemberPreset(selectedMember.id, value as EditablePreset)}
						>
							<Select.Trigger aria-labelledby="access-level-label-{selectedMember.id}" class="w-full">
								{getPresetLabel(selectedPreset)}
							</Select.Trigger>
							<Select.Content>
								{#each availablePresetOptions as option (option.value)}
									<Select.Item value={option.value} label={option.label} />
								{/each}
							</Select.Content>
						</Select.Root>
						<Field.Description>{memberAccess.getAccessOptionHelper(selectedPreset)}</Field.Description>
					</Field.Root>

					<input type="hidden" name="scopeSetKind" value={selectedScopeKind} />
					<section class="grid gap-3" aria-labelledby="capability-overrides-{selectedMember.id}">
						<div class="grid gap-1">
							<h3 id="capability-overrides-{selectedMember.id}" class="font-medium">Area-by-area access</h3>
							<p class="text-sm text-muted-foreground">
								Use overrides only when the preset is too broad or too limited for one area.
							</p>
						</div>
						<div class="grid gap-3 sm:grid-cols-2">
							{#each accessLanes as lane (lane.id)}
								{@const capabilityValue = memberAccess.getEditorCapabilityValue(
									selectedMember,
									lane.id,
									selectedPreset
								)}
								{@const capabilityChanged = memberAccess.isCapabilityChanged(selectedMember, lane.id)}
								<Field.Root class={capabilityChanged ? '' : 'opacity-60'}>
									<Field.Label id="capability-{selectedMember.id}-{lane.id}">
										{lane.label}
										{#if capabilityChanged}
											<span class="ml-1 inline-block size-1.5 rounded-full bg-ring" aria-label="changed"></span>
										{/if}
									</Field.Label>
									<input type="hidden" name="capabilityOverride:{lane.id}" value={capabilityValue} />
									<Select.Root
										type="single"
										value={capabilityValue}
										onValueChange={(value) =>
											memberAccess.setMemberCapability(selectedMember.id, lane.id, value as typeof capabilityValue)}
									>
										<Select.Trigger aria-labelledby="capability-{selectedMember.id}-{lane.id}" class="w-full">
											{getCapabilityLabel(capabilityValue)}
										</Select.Trigger>
										<Select.Content>
											{#each capabilityOptions as option (option.value)}
												<Select.Item value={option.value} label={option.label} />
											{/each}
										</Select.Content>
									</Select.Root>
								</Field.Root>
							{/each}
						</div>
					</section>

					<section class="grid gap-3" aria-labelledby="scope-set-{selectedMember.id}">
						<div class="grid gap-1">
							<h3 id="scope-set-{selectedMember.id}" class="font-medium">Group access</h3>
							<p class="text-sm text-muted-foreground">
								Choose whether access applies to every group or selected groups.
							</p>
						</div>
						<RadioGroup.Root
							value={selectedScopeKind}
							onValueChange={(value) =>
								memberAccess.setMemberScopeKind(selectedMember.id, value as 'organization' | 'groups')}
							class="sm:grid-cols-2"
						>
							<Field.Root orientation="horizontal">
								<RadioGroup.Item id="scope-all-{selectedMember.id}" value="organization" />
								<Field.Label for="scope-all-{selectedMember.id}">All groups</Field.Label>
							</Field.Root>
							<Field.Root orientation="horizontal">
								<RadioGroup.Item id="scope-groups-{selectedMember.id}" value="groups" />
								<Field.Label for="scope-groups-{selectedMember.id}">Selected groups</Field.Label>
							</Field.Root>
						</RadioGroup.Root>
						{#if selectedScopeKind === 'groups'}
							<div class="grid gap-2">
								{#each membersSection.groups as group (group.id)}
									{@const checked = selectedScopeGroupIds.includes(group.id)}
									{#if checked}<input type="hidden" name="scopeSetGroupIds" value={group.id} />{/if}
									<Field.Root orientation="horizontal">
										<Checkbox
											id="scope-group-{selectedMember.id}-{group.id}"
											{checked}
											onCheckedChange={(value) =>
												memberAccess.toggleMemberScopeGroup(selectedMember.id, group.id, value === true)}
										/>
										<Field.Label for="scope-group-{selectedMember.id}-{group.id}">{group.name}</Field.Label>
									</Field.Root>
								{/each}
							</div>
						{/if}
					</section>
				{:else}
					<input type="hidden" name="memberPreset" value={selectedPreset} />
				{/if}

				<Sheet.Footer>
					<Button type="button" variant="outline" onclick={() => memberAccess.closeMemberEditor(selectedMember.id)}>
						Cancel
					</Button>
					<Button type="submit" disabled={accessLoading || changeCount === 0}>
						{#if accessLoading}
							Saving...
						{:else if changeCount > 0}
							Save {changeCount} {changeCount === 1 ? 'change' : 'changes'}
						{:else}
							No changes
						{/if}
					</Button>
				</Sheet.Footer>
			</form>
		</Sheet.Content>
	{/if}
</Sheet.Root>

{#if pendingRemoveMemberForm}
	<AppDialog.Root
		open={Boolean(pendingRemoveMemberForm)}
		onOpenChange={(open) => {
			if (!open) {
				pendingRemoveMemberForm = null;
				pendingRemoveMemberEmail = '';
			}
		}}
	>
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title>Remove Member</AppDialog.Title>
				<AppDialog.Description>Remove {pendingRemoveMemberEmail} from this organization?</AppDialog.Description>
			</AppDialog.Header>
			<p class="px-4 text-sm text-muted-foreground">
				Removing this member ends their access to this Organization. Personnel and Calendar records stay in the
				Organization.
			</p>
			<AppDialog.Footer>
				<Button
					type="button"
					variant="outline"
					onclick={() => {
						pendingRemoveMemberForm = null;
						pendingRemoveMemberEmail = '';
					}}>Cancel</Button
				>
				<Button
					type="button"
					variant="destructive"
					onclick={() => {
						pendingRemoveMemberForm?.requestSubmit();
						pendingRemoveMemberForm = null;
						pendingRemoveMemberEmail = '';
					}}>Remove member</Button
				>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}
