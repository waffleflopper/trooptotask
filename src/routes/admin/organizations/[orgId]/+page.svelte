<script lang="ts">
	import { onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import SuspendModal from '$features/platform-admin/components/SuspendModal.svelte';
	import TransferOwnershipModal from '$features/platform-admin/components/TransferOwnershipModal.svelte';
	import OrganizationActivitySkeleton from '$features/platform-admin/components/OrganizationActivitySkeleton.svelte';
	import { adminBadgeVariant, formatAdminLabel } from '$features/platform-admin/components/adminTheme';
	import { describeAuditEvent } from '$features/platform-admin/organizationActivity';
	import { PLATFORM_ORGANIZATION_STATUS_LABELS } from '$features/platform-admin/organizationSupportTypes';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import {
		WorkspaceToolbar,
		type ToolbarItem,
		type WorkspaceToolbarProps
	} from '$lib/components/patterns/workspace-toolbar';
	import { formatDisplayDate, formatDisplayDateTime, formatRelativeDate } from '$lib/utils/dates';

	let { data }: { data: PageData } = $props();

	const org = $derived(data.organization);
	const isSuspended = $derived(org.suspendedAt !== null);
	const owners = $derived(org.members.filter((member) => member.role === 'owner'));
	const ownerLabel = $derived(
		owners.length === 0 ? 'No owner' : owners.length > 1 ? 'Multiple owners' : (owners[0].email ?? '(unknown)')
	);
	const memberEmails = $derived(new Map(org.members.map((member) => [member.userId, member.email])));
	const transferMembers = $derived(
		org.members.map((member) => ({ userId: member.userId, email: member.email ?? '(unknown)', role: member.role }))
	);

	let showSuspendModal = $state(false);
	let showTransferModal = $state(false);
	let navigationLifetime = $state(0);
	const toolbarItems = $derived<ToolbarItem[]>([
		{
			kind: 'action',
			id: 'suspend',
			label: isSuspended ? 'Unsuspend' : 'Suspend',
			destructive: !isSuspended,
			menuOnly: true,
			onclick: () => (showSuspendModal = true)
		}
	]);
	const toolbarPrimary: WorkspaceToolbarProps['primary'] = {
		kind: 'action',
		id: 'transfer',
		label: 'Transfer Ownership',
		onclick: () => (showTransferModal = true)
	};

	beforeNavigate(() => {
		navigationLifetime += 1;
		showSuspendModal = false;
		showTransferModal = false;
	});
	onDestroy(() => {
		navigationLifetime += 1;
	});

	async function refreshOrganization(orgId: string, lifetime: number) {
		if (orgId !== org.id || lifetime !== navigationLifetime) throw new Error('Organization is no longer current');
		await invalidateAll();
		if (orgId !== org.id || lifetime !== navigationLifetime) throw new Error('Organization is no longer current');
	}

	async function reloadSuspension(lifetime: number, orgId: string): Promise<boolean> {
		await refreshOrganization(orgId, lifetime);
		return isSuspended;
	}

	async function handleSuspendComplete(lifetime: number, targetId: string, suspended: boolean) {
		if (targetId !== org.id || lifetime !== navigationLifetime) return;
		if ((await reloadSuspension(lifetime, targetId)) !== suspended)
			throw new Error('Organization state could not be refreshed');
		if (targetId !== org.id || lifetime !== navigationLifetime) return;
		showSuspendModal = false;
	}

	async function reloadOwnership(lifetime: number, orgId: string, targetUserId: string) {
		await refreshOrganization(orgId, lifetime);
		if (owners.length !== 1) throw new Error('Ownership could not be refreshed');
		return {
			ownerUserId: owners[0].userId,
			targetIsEligible: org.members.some(
				(member) => member.userId === targetUserId && (member.role === 'member' || member.role === 'admin')
			)
		};
	}

	async function handleTransferComplete(lifetime: number, orgId: string, targetUserId: string) {
		if (orgId !== org.id || lifetime !== navigationLifetime) return;
		const current = await reloadOwnership(lifetime, orgId, targetUserId);
		if (orgId !== org.id || lifetime !== navigationLifetime) return;
		if (current.ownerUserId !== targetUserId) throw new Error('Ownership could not be refreshed');
		showTransferModal = false;
	}
</script>

<svelte:head>
	<title>{org.name} - Organizations - Admin - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide">
	<PageShell.Header title={org.name} subtitle={`Created ${formatDisplayDate(org.createdAt)}`}>
		{#snippet back()}
			<Button href="/admin/organizations" variant="ghost" size="sm">Back to Organizations</Button>
		{/snippet}
		{#snippet meta()}
			<Badge variant={adminBadgeVariant(org.status)}>{PLATFORM_ORGANIZATION_STATUS_LABELS[org.status]}</Badge>
		{/snippet}
	</PageShell.Header>

	<WorkspaceToolbar ariaLabel="Organization controls" items={toolbarItems} primary={toolbarPrimary} />

	{#if isSuspended}
		<Alert.Root variant="destructive">
			<Alert.Title>This Organization is suspended.</Alert.Title>
			<Alert.Description>
				<span class="block wrap-anywhere">
					{org.suspension?.reason ?? 'No reason recorded'}
				</span>
				<span class="mt-1 block text-xs">
					Suspended {formatDisplayDateTime(org.suspension?.suspendedAt ?? org.suspendedAt)}{org.suspension
						?.suspendedByEmail
						? ` by ${org.suspension.suspendedByEmail}`
						: ''}
				</span>
			</Alert.Description>
		</Alert.Root>
	{/if}

	<PageShell.FactGrid layout="three" class="grid-cols-2">
		<PageShell.Metric
			label="Owner"
			value={ownerLabel}
			class="col-span-2 md:col-span-1 [&_strong]:text-base [&_strong]:wrap-anywhere"
		/>
		<PageShell.Metric label="Members" value={org.members.length} />
		<PageShell.Metric label="Personnel" value={org.personnelCount} />
		<PageShell.Metric
			label="Last active"
			value={org.lastActiveAt ? formatRelativeDate(org.lastActiveAt) : 'Never used'}
		/>
		<PageShell.Metric label="Created" value={formatDisplayDate(org.createdAt)} />
		<PageShell.Metric label="Status" value={PLATFORM_ORGANIZATION_STATUS_LABELS[org.status]} />
	</PageShell.FactGrid>

	<section class="grid gap-3" aria-labelledby="org-members">
		<PageShell.SectionHeader id="org-members" title="Members" size="compact" />
		{#if org.members.length === 0}
			<Empty.Root class="rounded-lg border">
				<Empty.Header><Empty.Title>No members.</Empty.Title></Empty.Header>
			</Empty.Root>
		{:else}
			<ul class="divide-y rounded-lg border bg-card">
				{#each org.members as member (member.userId)}
					<li class="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_10rem] sm:items-center">
						<a
							href={resolve(`/admin/users/${member.userId}` as `/admin/users/${string}`)}
							class="font-medium wrap-anywhere underline-offset-4 hover:underline">{member.email ?? '(unknown)'}</a
						>
						<span><Badge variant={adminBadgeVariant(member.role)}>{formatAdminLabel(member.role)}</Badge></span>
						<span class="text-sm text-muted-foreground">
							{member.lastSignInAt ? `Signed in ${formatRelativeDate(member.lastSignInAt)}` : 'Never signed in'}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="grid gap-3" aria-labelledby="org-invitations">
		<PageShell.SectionHeader id="org-invitations" title="Pending invitations" size="compact" />
		{#if org.invitations.length === 0}
			<Empty.Root class="rounded-lg border">
				<Empty.Header><Empty.Title>No pending invitations.</Empty.Title></Empty.Header>
			</Empty.Root>
		{:else}
			<ul class="divide-y rounded-lg border bg-card">
				{#each org.invitations as invitation (invitation.id)}
					<li class="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_14rem] sm:items-center">
						<span class="font-medium wrap-anywhere">{invitation.email}</span>
						<span><Badge variant={adminBadgeVariant(invitation.role)}>{formatAdminLabel(invitation.role)}</Badge></span>
						<span class="text-sm text-muted-foreground">
							Invited {formatDisplayDate(invitation.invitedAt)}{invitation.expiresAt
								? `, expires ${formatDisplayDate(invitation.expiresAt)}`
								: ''}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="grid gap-3" aria-labelledby="org-activity">
		<PageShell.SectionHeader id="org-activity" title="Recent activity" size="compact" />
		{#await data.activity}
			<OrganizationActivitySkeleton />
		{:then result}
			{#if result.status === 'failed'}
				<Alert.Root variant="destructive">
					<Alert.Title>Recent activity could not be loaded.</Alert.Title>
					<Alert.Description>
						<span>The rest of this page is current. Try again, and reload the page if it keeps failing.</span>
						<span class="mt-2 block">
							<Button variant="outline" size="sm" onclick={() => invalidateAll()}>Try again</Button>
						</span>
					</Alert.Description>
				</Alert.Root>
			{:else if result.events.length === 0}
				<Empty.Root class="rounded-lg border">
					<Empty.Header><Empty.Title>No activity recorded for this Organization.</Empty.Title></Empty.Header>
				</Empty.Root>
			{:else}
				<ul class="divide-y rounded-lg border bg-card">
					{#each result.events as event (event.id)}
						<li class="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
							<span class="wrap-anywhere">{describeAuditEvent(event, memberEmails)}</span>
							<time class="text-sm text-muted-foreground" datetime={event.timestamp}>
								{formatDisplayDateTime(event.timestamp)}
							</time>
						</li>
					{/each}
				</ul>
			{/if}
		{/await}
	</section>
</PageShell.Root>

{#if showSuspendModal}
	<SuspendModal
		type="org"
		targetId={org.id}
		targetName={org.name}
		{isSuspended}
		onClose={() => (showSuspendModal = false)}
		onComplete={handleSuspendComplete.bind(null, navigationLifetime)}
		onReload={reloadSuspension.bind(null, navigationLifetime)}
	/>
{/if}

{#if showTransferModal}
	<TransferOwnershipModal
		orgId={org.id}
		orgName={org.name}
		members={transferMembers}
		onClose={() => (showTransferModal = false)}
		onComplete={handleTransferComplete.bind(null, navigationLifetime)}
		onReload={reloadOwnership.bind(null, navigationLifetime)}
	/>
{/if}
