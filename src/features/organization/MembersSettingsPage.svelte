<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Mail from '@lucide/svelte/icons/mail';
	import Search from '@lucide/svelte/icons/search';
	import { enhance } from '$app/forms';
	import { redirectToSensitiveActionStepUp } from '$features/identity';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import { useDataTable, type ColumnDef, type DataTableRowAction } from '$lib/components/ui/data-table/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { cn } from '$lib/utils.js';
	import { formatRelativeDate } from '$lib/utils/dates';
	import { settleAction } from '$lib/utils/settleAction';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import MemberAccessSheet from './MemberAccessSheet.svelte';
	import type {
		MembersSettingsActionData,
		MembersSettingsData,
		SettingsInvitationFunnelStatus,
		SettingsMemberRow
	} from './memberSettingsTypes';
	import {
		SETTINGS_ACCESS_OPTIONS,
		SETTINGS_GOVERNANCE_ROLE_OPTIONS,
		type EditableMembershipRole,
		type EditablePreset
	} from './settingsMemberAccessConstants';
	import {
		ALL_GROUPS,
		accessLabel,
		createSettingsMemberAccessWorkspace,
		memberInitials,
		presetHelper,
		presetLabel,
		roleHelper
	} from './settingsMemberAccessWorkspace.svelte';

	type Props = {
		settings: MembersSettingsData;
		form: MembersSettingsActionData;
		unit: string;
		viewerUserId: string | undefined;
	};

	let { settings, form, unit, viewerUserId }: Props = $props();

	let active = true;
	onDestroy(() => {
		active = false;
	});
	const isCurrent = () => active;

	const section = $derived(settings.sections.members);
	const isOwner = $derived(settings.currentMember.isOwner);
	const workspace = createSettingsMemberAccessWorkspace(() => ({
		members: section.rows,
		groups: section.groups,
		isOwner,
		offLanes: section.offLanes
	}));
	const visibleMembers = $derived(workspace.visibleMembers);
	const visibleIds = $derived(new Set(visibleMembers.map((member) => member.id)));

	const wide = new MediaQuery('min-width: 48rem', true);
	const memberColumns = (
		[
			['member', 'Member', undefined],
			['access', 'Access', '10.625rem'],
			['groups', 'Groups', '10.625rem'],
			['actions', '', '8rem']
		] as const
	).map(
		([key, header, width]): ColumnDef<SettingsMemberRow> => ({
			key,
			header,
			width,
			headerAriaLabel: key === 'actions' ? 'Row actions' : undefined,
			rowHeader: key === 'member',
			maxWidth: key === 'member' ? 'none' : undefined,
			value: () => '',
			sortable: false,
			searchable: false
		})
	);
	const narrowMemberColumns = memberColumns.filter((column) => column.key === 'member' || column.key === 'actions');
	// The filter hides rows instead of dropping them, so typing never remounts the roster.
	const memberTable = useDataTable<SettingsMemberRow>({
		data: () => workspace.members,
		columns: () => (wide.current ? memberColumns : narrowMemberColumns),
		rowKey: (member) => member.id
	});
	const history = new StreamedValue(() => section.invitationHistory);
	let historyOpen = $state(false);

	let filterInput = $state<HTMLInputElement | null>(null);
	let inviteEmailInput = $state<HTMLInputElement | null>(null);
	let accessOpener = $state<HTMLElement | null>(null);
	let memberRequestError = $state<string | null>(null);

	// Invite, Resend and Revoke share the `inviteError` outcome, so one request runs at a time and its owner,
	// the new invitation or a pending invitation's id, places the outcome.
	const NEW_INVITATION = 'new';
	let invitationOwner = $state(NEW_INVITATION);
	let invitationPending = $state(false);
	let invitationRequestError = $state<string | null>(null);
	// A new invitation request supersedes the outcome on screen; only the server's answer to it shows again.
	let invitationSupersededForm = $state.raw<MembersSettingsActionData | undefined>(undefined);
	const invitationForm = $derived(form === invitationSupersededForm ? undefined : form);
	const inviteLoading = $derived(invitationPending && invitationOwner === NEW_INVITATION);
	const inviteError = $derived(invitationRequestError ?? invitationForm?.inviteError);

	let removeForm = $state<HTMLFormElement | null>(null);
	let removeMemberId = $state('');
	let removingMemberId = $state<string | null>(null);
	let confirmRemove = $state<SettingsMemberRow | null>(null);

	const rowActions: DataTableRowAction<SettingsMemberRow>[] = [
		{ label: 'Remove', destructive: true, onSelect: (member) => (confirmRemove = member) }
	];

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
					if (!error && owner === NEW_INVITATION && result.type === 'success') workspace.resetInvite();
				},
				focus: () => [submitter as HTMLElement | null, inviteEmailInput, filterInput]
			});
			// The invite strip confirms in place; a pending invitation row confirms with a toast.
			if (
				active &&
				owner !== NEW_INVITATION &&
				result.type === 'success' &&
				typeof result.data?.inviteMessage === 'string'
			)
				toastStore.success(result.data.inviteMessage);
		};
	};

	const removeMemberEnhance: SubmitFunction = ({ formData, cancel }) => {
		if (removingMemberId) return cancel();
		const memberId = String(formData.get('membershipId'));
		removingMemberId = memberId;
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
				focus: () => [rowMenuTrigger(memberId), filterInput]
			});
		};
	};

	function rowMenuTrigger(memberId: string): HTMLElement | null {
		return document.querySelector<HTMLElement>(`[data-member-actions="${memberId}"] [aria-haspopup="menu"]`);
	}

	async function submitRemove(member: SettingsMemberRow) {
		confirmRemove = null;
		removeMemberId = member.id;
		await tick();
		removeForm?.requestSubmit();
	}

	function canManage(member: SettingsMemberRow): boolean {
		if (member.membershipRole === 'owner' || !section.canManageMemberAccess) return false;
		return member.membershipRole !== 'admin' || isOwner;
	}

	function memberName(member: SettingsMemberRow): string {
		return member.email ?? `${member.userId.slice(0, 8)}...`;
	}

	function plural(count: number, one: string, many = `${one}s`) {
		return `${count} ${count === 1 ? one : many}`;
	}

	function isFailedDelivery(status: SettingsInvitationFunnelStatus): boolean {
		return status === 'invitation_email_failed' || status === 'setup_email_failed';
	}

	const inviteHelper = $derived(
		workspace.invite.role === 'admin'
			? roleHelper('admin')
			: `${presetHelper(workspace.invite.preset)} They accept the invite after signing in.`
	);
</script>

<div class="grid gap-10">
	{#if section.canInvite}
		<section aria-label="Invite a member">
			<form
				method="POST"
				action="?/invite"
				class="grid gap-2.5 rounded-sm border bg-muted p-3.5"
				use:enhance={invitationEnhance}
			>
				{#if invitationOwner === NEW_INVITATION && inviteError}
					<Alert.Root variant="destructive">
						<Alert.Description>{inviteError}</Alert.Description>
					</Alert.Root>
				{/if}
				{#if invitationOwner === NEW_INVITATION && invitationForm?.inviteSuccess && !invitationRequestError}
					<Alert.Root role="status">
						<Alert.Description>{invitationForm.inviteMessage ?? 'Invitation created.'}</Alert.Description>
					</Alert.Root>
				{/if}
				<input type="hidden" name="membershipRole" value={workspace.invite.role} />
				{#if workspace.invite.role === 'member'}
					<input type="hidden" name="memberPreset" value={workspace.invite.preset} />
					<input
						type="hidden"
						name="scopeSetKind"
						value={workspace.invite.groupIds.length > 0 ? 'groups' : 'organization'}
					/>
					{#each workspace.invite.groupIds as groupId (groupId)}
						<input type="hidden" name="scopeSetGroupIds" value={groupId} />
					{/each}
				{/if}
				<div class="flex flex-wrap items-center gap-2">
					<Label for="invite-email" class="w-14 shrink-0 font-semibold">Invite</Label>
					<Input
						bind:ref={inviteEmailInput}
						id="invite-email"
						name="email"
						type="email"
						placeholder="name@unit.mil"
						class="min-w-48 flex-1 bg-background"
						aria-describedby="invite-helper"
						bind:value={workspace.invite.email}
						required
					/>
					{#if isOwner}
						<Select.Root
							type="single"
							bind:value={() => workspace.invite.role, (role: EditableMembershipRole) => (workspace.invite.role = role)}
						>
							<Select.Trigger aria-label="Role" class="w-28 bg-background">
								{workspace.invite.role === 'admin' ? 'Admin' : 'Member'}
							</Select.Trigger>
							<Select.Content>
								{#each SETTINGS_GOVERNANCE_ROLE_OPTIONS as option (option.value)}
									<Select.Item value={option.value} label={option.label} />
								{/each}
							</Select.Content>
						</Select.Root>
					{/if}
					{#if workspace.invite.role === 'member'}
						<Select.Root
							type="single"
							bind:value={() => workspace.invite.preset, (preset: EditablePreset) => (workspace.invite.preset = preset)}
						>
							<Select.Trigger aria-label="Preset" class="w-28 bg-background">
								{presetLabel(workspace.invite.preset)}
							</Select.Trigger>
							<Select.Content>
								{#each SETTINGS_ACCESS_OPTIONS as option (option.value)}
									<Select.Item value={option.value} label={option.label} />
								{/each}
							</Select.Content>
						</Select.Root>
						<Select.Root
							type="multiple"
							bind:value={() => workspace.inviteGroupsValue, (values: string[]) => workspace.setInviteGroups(values)}
						>
							<Select.Trigger aria-label="Groups" class="w-34 bg-background">
								<span class="truncate">{workspace.inviteGroupsLabel}</span>
							</Select.Trigger>
							<Select.Content>
								<Select.Item value={ALL_GROUPS} label="All groups" />
								{#each section.groups as group (group.id)}
									<Select.Item value={group.id} label={group.name} />
								{/each}
							</Select.Content>
						</Select.Root>
					{:else}
						<p class="flex h-8 w-62 items-center rounded-lg border bg-background px-2.5 text-sm text-muted-foreground">
							Uses Admin authority
						</p>
					{/if}
					<!-- aria-disabled keeps focus on the pressed button while an invitation request is pending. -->
					<Button
						type="submit"
						aria-disabled={invitationPending ? 'true' : undefined}
						aria-busy={inviteLoading || undefined}>{inviteLoading ? 'Sending...' : 'Send invite'}</Button
					>
				</div>
				<p id="invite-helper" class="text-sm text-muted-foreground sm:pl-16">{inviteHelper}</p>
			</form>
		</section>
	{/if}

	{#if section.invitations.length > 0}
		<section aria-label="Waiting on them" class="grid">
			<PageShell.SectionHeader
				size="compact"
				ruled
				title="Waiting on them"
				detail={plural(section.invitations.length, 'invitation')}
			/>
			<ul>
				{#each section.invitations as invite (invite.id)}
					{@const failed = isFailedDelivery(invite.funnelStatus)}
					<li
						id="invitation-row-{invite.id}"
						class="grid gap-3 border-b py-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)_auto] md:items-center md:gap-4"
					>
						<div class="flex min-w-0 items-center gap-3">
							<span
								class="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground"
								aria-hidden="true"
							>
								<Mail class="size-4" />
							</span>
							<div class="grid min-w-0">
								<p class="truncate text-sm font-semibold">{invite.email}</p>
								<p class="font-mono text-xs text-muted-foreground">
									{accessLabel(invite)} · sent {formatRelativeDate(invite.createdAt)}
								</p>
							</div>
						</div>
						<div class="grid min-w-0 gap-0.5 pl-11 md:pl-0">
							<p class={cn('font-mono text-xs', failed ? 'font-semibold text-destructive-text' : 'text-foreground')}>
								{invite.funnelStatusLabel}
							</p>
							<p class="text-[13px] text-muted-foreground">{invite.funnelStatusDetail}</p>
							{#if invitationOwner === invite.id && inviteError}
								<Alert.Root variant="destructive" class="mt-2">
									<Alert.Description>{inviteError}</Alert.Description>
								</Alert.Root>
							{/if}
						</div>
						<div class="flex gap-1 pl-11 md:pl-0">
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
									Resend <span class="sr-only">invitation to {invite.email}</span>
								</Button>
							</form>
							<form method="POST" action="?/revokeInvite" use:enhance={invitationEnhance}>
								<input type="hidden" name="inviteId" value={invite.id} />
								<Button
									type="submit"
									variant="ghost"
									size="sm"
									class="text-destructive-text"
									aria-disabled={invitationPending ? 'true' : undefined}
									aria-busy={(invitationPending && invitationOwner === invite.id) || undefined}
								>
									Revoke <span class="sr-only">invitation for {invite.email}</span>
								</Button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section aria-label="Members" class="grid">
		<PageShell.SectionHeader
			size="compact"
			ruled
			title="Members"
			detail={plural(section.rows.length, 'person', 'people')}
		>
			{#snippet action()}
				<InputGroup.Root class="w-full sm:w-55">
					<InputGroup.Addon>
						<Search aria-hidden="true" />
					</InputGroup.Addon>
					<InputGroup.Input
						bind:ref={filterInput}
						type="search"
						placeholder="Filter members"
						aria-label="Filter members"
						bind:value={workspace.filter}
					/>
				</InputGroup.Root>
			{/snippet}
		</PageShell.SectionHeader>

		{#if memberRequestError || form?.memberError || form?.accessSuccess}
			<div class="pt-3">
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

		<DataTable.DataTable
			table={memberTable}
			variant="editorial"
			ariaLabel="Members"
			emptyMessage={workspace.filter.trim() ? `No members matching "${workspace.filter.trim()}"` : 'No members yet'}
			stickyHeader={false}
			cell={memberCell}
			rowHidden={(member) => !visibleIds.has(member.id)}
		/>

		<Collapsible.Root bind:open={historyOpen}>
			<div class="flex flex-wrap items-center justify-between gap-3 py-3">
				<p class="font-mono text-xs text-muted-foreground">
					{visibleMembers.length === section.rows.length
						? plural(section.rows.length, 'member')
						: `${visibleMembers.length} of ${plural(section.rows.length, 'member')}`}
				</p>
				{#if history.current.state === 'pending'}
					<Skeleton class="h-5 w-48" aria-hidden="true" />
					<span class="sr-only">Loading invitation history</span>
				{:else if history.current.state === 'failed'}
					<p class="font-mono text-xs text-muted-foreground">Invitation history could not be loaded.</p>
				{:else if history.current.state === 'ready' && history.current.value.length > 0}
					<Collapsible.Trigger>
						{#snippet child({ props })}
							<Button {...props} type="button" variant="ghost" size="sm" class="-mr-2">
								<span class="font-medium">Invitation history</span>
								<span class="font-mono text-xs text-muted-foreground"
									>· {history.current.state === 'ready' ? history.current.value.length : 0} closed</span
								>
								<ChevronDown
									data-icon="inline-end"
									aria-hidden="true"
									class={cn('transition-transform', historyOpen && 'rotate-180')}
								/>
							</Button>
						{/snippet}
					</Collapsible.Trigger>
				{/if}
			</div>
			{#if history.current.state === 'ready'}
				<Collapsible.Content>
					{#if historyOpen}
						<ul class="border-t">
							{#each history.current.value as invite (invite.id)}
								<li class="flex flex-wrap items-baseline justify-between gap-x-4 border-b py-2.5">
									<p class="min-w-0 truncate text-sm">{invite.email}</p>
									<p class="font-mono text-xs text-muted-foreground">
										{accessLabel(invite)} · {invite.lifecycleStatusLabel}
										{formatRelativeDate(invite.lifecycleAt)}
									</p>
								</li>
							{/each}
						</ul>
					{/if}
				</Collapsible.Content>
			{/if}
		</Collapsible.Root>
	</section>
</div>

<form bind:this={removeForm} method="POST" action="?/removeMember" hidden use:enhance={removeMemberEnhance}>
	<input type="hidden" name="membershipId" value={removeMemberId} />
</form>

<MemberAccessSheet
	{workspace}
	{unit}
	{isOwner}
	groups={section.groups}
	accessError={form?.accessError}
	opener={accessOpener}
	fallbackFocus={() => filterInput}
	onSaveStart={() => (memberRequestError = null)}
	onRemove={(member) => (confirmRemove = member)}
/>

<AppDialog.Root
	open={confirmRemove !== null}
	onOpenChange={(open) => {
		if (!open) confirmRemove = null;
	}}
>
	{#if confirmRemove}
		{@const target = confirmRemove}
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title>Remove {memberName(target)} from {unit}?</AppDialog.Title>
				<AppDialog.Description>
					They lose access to {unit} right away. Personnel and Calendar records stay in {unit}.
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Footer>
				<Button type="button" variant="outline" onclick={() => (confirmRemove = null)}>Cancel</Button>
				<Button type="button" variant="destructive" onclick={() => submitRemove(target)}>Remove member</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	{/if}
</AppDialog.Root>

{#snippet memberCell(member: SettingsMemberRow, column: ColumnDef<SettingsMemberRow>)}
	{#if column.key === 'member'}
		<div class="flex min-w-0 items-center gap-3 py-1.5 whitespace-normal">
			<span
				class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[11px] font-semibold"
				aria-hidden="true"
			>
				{memberInitials(member.email)}
			</span>
			<div class="grid min-w-0 gap-0.5">
				<p class="flex min-w-0 items-center gap-2">
					<span class="min-w-0 text-sm font-semibold wrap-anywhere">{memberName(member)}</span>
					{#if member.userId === viewerUserId}
						<span class="shrink-0 rounded-sm border px-1.5 font-mono text-[11px] tracking-[0.08em] uppercase">You</span>
					{/if}
				</p>
				{#if !wide.current}
					<p class="flex flex-wrap gap-x-3">
						<span>{@render accessLane(member)}</span>
						<span>{@render groupsLane(member)}</span>
					</p>
				{/if}
			</div>
		</div>
	{:else if column.key === 'access'}
		<p class="grid">{@render accessLane(member)}</p>
	{:else if column.key === 'groups'}
		<p>{@render groupsLane(member)}</p>
	{:else if column.key === 'actions' && canManage(member)}
		<div class="flex items-center justify-end gap-1" data-member-actions={member.id}>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onclick={(event) => {
					accessOpener = event.currentTarget;
					workspace.open(member);
				}}
			>
				Manage <span class="sr-only">access for {memberName(member)}</span>
			</Button>
			<DataTable.RowActions
				row={member}
				actions={rowActions}
				ariaLabel={`More actions for ${memberName(member)}`}
				busy={removingMemberId === member.id}
			/>
		</div>
	{/if}
{/snippet}

{#snippet accessLane(member: SettingsMemberRow)}
	{@const changes = member.membershipRole === 'member' ? member.overriddenCapabilityLabels.length : 0}
	<span class="sr-only">Access:</span>
	<span
		class={cn(
			'font-mono text-[11px] font-semibold tracking-[0.08em] uppercase',
			member.membershipRole === 'member' ? 'text-muted-foreground' : 'text-foreground'
		)}>{accessLabel(member)}</span
	>
	{#if changes > 0}
		<span class="font-mono text-[11px] font-semibold text-warning-foreground">+{plural(changes, 'area change')}</span>
	{/if}
{/snippet}

{#snippet groupsLane(member: SettingsMemberRow)}
	<span class="sr-only">Groups:</span>
	<span
		class={cn(
			'font-mono text-xs',
			member.scopeDisplayLabel === 'No groups' ? 'font-semibold text-warning-foreground' : 'text-muted-foreground'
		)}>{member.scopeDisplayLabel}</span
	>
{/snippet}
