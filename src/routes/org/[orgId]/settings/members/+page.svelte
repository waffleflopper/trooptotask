<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import type { PageProps } from './$types';
	import { Edit, RefreshCw, Search, Trash2 } from '@lucide/svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { explainPolicyReasonCode } from '$lib/access/policyDecisionExplanations';
	import { redirectToSensitiveActionStepUp } from '$features/identity';
	import * as Alert from '$lib/components/ui/alert/index.js';
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
	import { settleAction } from '$lib/utils/settleAction';
	import { toastStore } from '$lib/stores/toast.svelte';
	import {
		createSettingsMemberAccessWorkspace,
		type EditableMembershipRole,
		type EditablePreset
	} from '$features/organization';
	import type {
		SettingsMemberAccessRow,
		SettingsMemberRow,
		SettingsInvitationFunnelStatus
	} from '$features/organization/contracts';
	import { pluralize } from '../settingsWorkspaceFormatters';

	let { data, form }: PageProps = $props();
	let active = true;
	onDestroy(() => {
		active = false;
	});
	const isCurrent = () => active;

	let accessLoading = $state(false);
	let memberSearch = $state('');
	let pendingRemoveMemberForm = $state<HTMLFormElement | null>(null);
	let pendingRemoveMemberEmail = $state('');
	let removingMemberId = $state<string | null>(null);
	let accessErrorMemberId = $state<string | null>(null);
	let accessRequestError = $state<string | null>(null);
	let accessOpener = $state<HTMLElement | null>(null);
	let accessSaveButton = $state<HTMLButtonElement | null>(null);
	let memberRequestError = $state<string | null>(null);
	// Invite, Resend and Revoke share the `inviteError` outcome, so one request runs at a time and its owner,
	// the new invitation or a pending invitation's id, places the outcome.
	const NEW_INVITATION = 'new';
	let invitationOwner = $state(NEW_INVITATION);
	let invitationPending = $state(false);
	let invitationRequestError = $state<string | null>(null);
	// A new invitation request supersedes the outcome on screen; only the server's answer to it shows again.
	let invitationSupersededForm = $state.raw<typeof form | undefined>(undefined);
	const invitationForm = $derived(form === invitationSupersededForm ? undefined : form);
	let membersHeading = $state<HTMLHeadingElement | null>(null);
	let pendingInvitesHeading = $state<HTMLHeadingElement | null>(null);

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
	const inviteLoading = $derived(invitationPending && invitationOwner === NEW_INVITATION);
	const sessionEmail = $derived((data.session as { user?: { email?: string | null } } | null | undefined)?.user?.email);

	const invitationEnhance: SubmitFunction = ({ formData, submitter, cancel }) => {
		if (invitationPending) return cancel();
		const owner = formData.has('inviteId') ? String(formData.get('inviteId')) : NEW_INVITATION;
		invitationOwner = owner;
		invitationPending = true;
		invitationRequestError = null;
		invitationSupersededForm = form;
		return async (outcome) => {
			if (!active) return;
			const { result } = outcome;
			if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) {
				invitationPending = false;
				return;
			}
			await settleAction(outcome, {
				isCurrent,
				settled: (error) => {
					invitationRequestError = error;
					invitationPending = false;
					if (!error && owner === NEW_INVITATION && result.type === 'success') memberAccess.clearInviteEmail();
				},
				focus: () => [submitter as HTMLElement | null, pendingInvitesHeading, membersHeading]
			});
			// The invite form confirms in place; a pending invitation row confirms with a toast.
			if (
				active &&
				owner !== NEW_INVITATION &&
				result.type === 'success' &&
				typeof result.data?.inviteMessage === 'string'
			)
				toastStore.success(result.data.inviteMessage);
		};
	};

	const removeMemberEnhance: SubmitFunction = ({ formData, formElement, cancel }) => {
		if (removingMemberId) return cancel();
		removingMemberId = String(formData.get('membershipId'));
		memberRequestError = null;
		return async (outcome) => {
			if (!active) return;
			if (outcome.result.type === 'failure' && redirectToSensitiveActionStepUp(outcome.result.data)) {
				removingMemberId = null;
				return;
			}
			await settleAction(outcome, {
				isCurrent,
				settled: (error) => {
					memberRequestError = error;
					removingMemberId = null;
				},
				focus: () => [formElement.querySelector('button'), membersHeading]
			});
		};
	};

	function closeAccessSheet(memberId: string) {
		accessErrorMemberId = null;
		accessRequestError = null;
		memberAccess.closeMemberEditor(memberId);
	}

	function memberName(member: SettingsMemberAccessRow): string {
		return member.email ?? `${member.userId.slice(0, 8)}...`;
	}

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
			<form method="POST" action="?/invite" use:enhance={invitationEnhance}>
				{#if invitationOwner === NEW_INVITATION && (invitationRequestError || invitationForm?.inviteError)}
					<Alert.Root variant="destructive" class="mb-4">
						<Alert.Description>{invitationRequestError ?? invitationForm?.inviteError}</Alert.Description>
					</Alert.Root>
				{/if}
				{#if invitationOwner === NEW_INVITATION && invitationForm?.inviteSuccess && !invitationRequestError}
					<Alert.Root role="status" class="mb-4">
						<Alert.Description>{invitationForm.inviteMessage ?? 'Invitation created.'}</Alert.Description>
					</Alert.Root>
				{/if}
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
								<Select.Content aria-labelledby="invite-membership-role-label">
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
								<Select.Content aria-labelledby="invite-access-level-label">
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
						<!-- aria-disabled keeps focus on the pressed button while an invitation request is pending. -->
						<Button
							type="submit"
							aria-disabled={invitationPending ? 'true' : undefined}
							aria-busy={inviteLoading || undefined}>{inviteLoading ? 'Inviting...' : 'Invite'}</Button
						>
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
				<h3 bind:this={membersHeading} tabindex="-1" class="font-medium outline-none">Organization members</h3>
				<p class="text-sm text-muted-foreground">
					{membersSection.rows.length}
					{pluralize('member', membersSection.rows.length)}
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-3">
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

		{#if memberRequestError || form?.memberError || form?.accessSuccess}
			<div class="border-b p-4">
				{#if memberRequestError || form?.memberError}
					<Alert.Root variant="destructive">
						<Alert.Description>{memberRequestError ?? form?.memberError}</Alert.Description>
					</Alert.Root>
				{:else}
					<Alert.Root role="status">
						<Alert.Description>Access updated.</Alert.Description>
					</Alert.Root>
				{/if}
			</div>
		{/if}

		<div class="divide-y">
			{#each filteredMembers as member (member.id)}
				{@const accessShape = memberAccess.getMemberAccessShape(member)}
				{@const accessBadge = memberAccess.getMemberAccessBadge(member, accessShape)}
				{@const overrides = (member as SettingsMemberRow).overriddenCapabilityLabels}
				<div class="grid gap-3 p-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
					<div
						class="flex size-10 items-center justify-center rounded-md border bg-muted text-sm font-medium"
						aria-hidden="true"
					>
						{memberAccess.getMemberInitials(member.email)}
					</div>
					<div class="min-w-0 grid gap-2">
						<div class="min-w-0">
							<p class="truncate font-medium">{memberName(member)}</p>
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
							<Button
								type="button"
								variant="outline"
								size="sm"
								onclick={(event) => {
									accessOpener = event.currentTarget;
									memberAccess.openMemberEditor(member);
								}}
							>
								<Edit />
								{isOwner ? 'Manage role & access' : 'Manage access'}
								<span class="sr-only">for {memberName(member)}</span>
							</Button>
							<form method="POST" action="?/removeMember" use:enhance={removeMemberEnhance}>
								<input type="hidden" name="membershipId" value={member.id} />
								<Button
									type="button"
									variant="destructive"
									size="sm"
									aria-disabled={removingMemberId === member.id ? 'true' : undefined}
									aria-busy={removingMemberId === member.id || undefined}
									onclick={(event) => {
										if (removingMemberId === member.id) return;
										pendingRemoveMemberForm = (event.currentTarget as HTMLButtonElement).closest('form');
										pendingRemoveMemberEmail = member.email ?? 'this member';
									}}
								>
									<Trash2 />
									Remove <span class="sr-only">{memberName(member)}</span>
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

	{#if membersSection.invitations.length > 0}
		<section
			class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
			aria-labelledby="pending-invites-heading"
		>
			<div class="flex items-center justify-between gap-3">
				<h3
					bind:this={pendingInvitesHeading}
					id="pending-invites-heading"
					tabindex="-1"
					class="text-lg font-semibold tracking-tight outline-none"
				>
					Pending Invitations
				</h3>
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
							{#if invitationOwner === invite.id && (invitationRequestError || invitationForm?.inviteError)}
								<Alert.Root variant="destructive">
									<Alert.Description>{invitationRequestError ?? invitationForm?.inviteError}</Alert.Description>
								</Alert.Root>
							{/if}
						</div>
						<div class="flex flex-wrap gap-2">
							<form method="POST" action="?/resendInvite" use:enhance={invitationEnhance}>
								<input type="hidden" name="inviteId" value={invite.id} />
								<!-- Resend stays enabled in every funnel state; it is insufficient in some, never futile. -->
								<Button
									type="submit"
									variant="outline"
									size="sm"
									aria-disabled={invitationPending ? 'true' : undefined}
									aria-busy={(invitationPending && invitationOwner === invite.id) || undefined}
								>
									<RefreshCw />
									Resend <span class="sr-only">invitation to {invite.email}</span>
								</Button>
							</form>
							<form method="POST" action="?/revokeInvite" use:enhance={invitationEnhance}>
								<input type="hidden" name="inviteId" value={invite.id} />
								<Button
									type="submit"
									variant="outline"
									size="sm"
									aria-disabled={invitationPending ? 'true' : undefined}
									aria-busy={(invitationPending && invitationOwner === invite.id) || undefined}
								>
									Revoke <span class="sr-only">invitation for {invite.email}</span>
								</Button>
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
		if (!open && selectedMember && !accessLoading) closeAccessSheet(selectedMember.id);
	}}
>
	{#if selectedMember}
		{@const selectedMembershipRole = memberAccess.getSelectedMembershipRole(selectedMember)}
		{@const selectedPreset = memberAccess.getSelectedPreset(selectedMember)}
		{@const selectedScopeKind = memberAccess.getSelectedScopeKind(selectedMember)}
		{@const selectedScopeGroupIds = memberAccess.getSelectedScopeGroupIds(selectedMember)}
		{@const changeCount = memberAccess.editorChangeCount(selectedMember)}
		<Sheet.Content
			class="w-full overflow-y-auto sm:max-w-xl"
			aria-busy={accessLoading || undefined}
			showCloseButton={!accessLoading}
			escapeKeydownBehavior={accessLoading ? 'ignore' : 'close'}
			interactOutsideBehavior={accessLoading ? 'ignore' : 'close'}
		>
			<Sheet.Header>
				<Sheet.Title>Manage Access</Sheet.Title>
				<Sheet.Description>{selectedMember.email ?? 'Selected member'}</Sheet.Description>
			</Sheet.Header>
			<form
				method="POST"
				action="?/updateMemberAccess"
				class="grid gap-5 px-4 pb-4"
				use:enhance={({ cancel }) => {
					if (accessLoading) return cancel();
					const memberId = selectedMember.id;
					accessLoading = true;
					accessErrorMemberId = memberId;
					accessRequestError = null;
					memberRequestError = null;
					return async (outcome) => {
						if (!active) return;
						const { result } = outcome;
						if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) {
							accessLoading = false;
							return;
						}
						await settleAction(outcome, {
							isCurrent,
							settled: (error) => {
								accessRequestError = error;
								accessLoading = false;
								if (!error && result.type === 'success') closeAccessSheet(memberId);
							},
							focus: () => [accessSaveButton, accessOpener, membersHeading]
						});
					};
				}}
			>
				<fieldset class="contents" disabled={accessLoading}>
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
								<Select.Content aria-labelledby="membership-role-label-{selectedMember.id}">
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
								<Select.Content aria-labelledby="access-level-label-{selectedMember.id}">
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
											<Select.Content aria-labelledby="capability-{selectedMember.id}-{lane.id}">
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

					{#if accessRequestError || (form?.accessError && accessErrorMemberId === selectedMember.id)}
						<Alert.Root variant="destructive">
							<Alert.Description>{accessRequestError ?? form?.accessError}</Alert.Description>
						</Alert.Root>
					{/if}
				</fieldset>
				<!-- Outside the fieldset so Save keeps focus (aria-disabled) while the request is pending. -->
				<Sheet.Footer>
					<Button
						type="button"
						variant="outline"
						disabled={accessLoading}
						onclick={() => closeAccessSheet(selectedMember.id)}>Cancel</Button
					>
					<Button
						bind:ref={accessSaveButton}
						type="submit"
						disabled={changeCount === 0}
						aria-disabled={accessLoading ? 'true' : undefined}
						aria-busy={accessLoading || undefined}
					>
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
