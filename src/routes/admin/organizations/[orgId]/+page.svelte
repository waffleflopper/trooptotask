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
	const MEMBER_PREVIEW = 10;
	let expandedMembersFor = $state<string | null>(null);
	const showAllMembers = $derived(expandedMembersFor === org.id);
	const visibleMembers = $derived(showAllMembers ? org.members : org.members.slice(0, MEMBER_PREVIEW));
	const ownerSentence = $derived(
		owners.length === 1 ? `Owned by ${ownerLabel}.` : owners.length === 0 ? 'No owner.' : 'Multiple owners.'
	);

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
	<div>
		<Button href="/admin/organizations" variant="ghost" size="sm">Back to Organizations</Button>
	</div>
	<PageShell.Header
		variant="display"
		eyebrow={`Organization · Created ${formatDisplayDate(org.createdAt)}`}
		title={org.name}
	>
		{#snippet subtitle()}
			<span class="wrap-anywhere">{ownerSentence}</span>
		{/snippet}
		{#snippet meta()}
			<Badge variant={adminBadgeVariant(org.status)}>{PLATFORM_ORGANIZATION_STATUS_LABELS[org.status]}</Badge>
		{/snippet}
		{#snippet aside()}
			<Button variant="outline" onclick={() => (showTransferModal = true)}>Transfer Ownership</Button>
			<Button variant={isSuspended ? 'outline' : 'destructive'} onclick={() => (showSuspendModal = true)}>
				{isSuspended ? 'Unsuspend Organization' : 'Suspend Organization'}
			</Button>
		{/snippet}
	</PageShell.Header>

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

	<div class="grid items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
		<section class="grid gap-2 rounded-lg border bg-card p-4 lg:order-2" aria-labelledby="org-glance">
			<h2 id="org-glance" class="font-heading text-xl font-bold">At a glance</h2>
			<dl>
				<PageShell.FactRow label="Owner" value={ownerLabel} />
				<PageShell.FactRow label="Members" value={String(org.members.length)} />
				<PageShell.FactRow label="Personnel" value={String(org.personnelCount)} />
				<PageShell.FactRow
					label="Last active"
					value={org.lastActiveAt ? formatRelativeDate(org.lastActiveAt) : 'Never used'}
				/>
				<PageShell.FactRow label="Created" value={formatDisplayDate(org.createdAt)} />
				<PageShell.FactRow label="Status" value={PLATFORM_ORGANIZATION_STATUS_LABELS[org.status]} />
				<PageShell.FactRow label="ID" value={org.id} mono />
			</dl>
		</section>

		<div class="grid min-w-0 gap-8 lg:order-1">
			<section class="grid gap-2" aria-labelledby="org-members">
				<PageShell.SectionHeader
					id="org-members"
					title="Members"
					detail={String(org.members.length)}
					size="compact"
					ruled
				>
					{#snippet action()}
						{#if org.members.length > MEMBER_PREVIEW}
							<Button
								variant="ghost"
								size="sm"
								class="font-mono text-xs tracking-[0.08em] uppercase"
								aria-expanded={showAllMembers}
								onclick={() => (expandedMembersFor = showAllMembers ? null : org.id)}
							>
								{showAllMembers ? 'Show fewer' : `Show all ${org.members.length}`}
							</Button>
						{/if}
					{/snippet}
				</PageShell.SectionHeader>
				{#if org.members.length === 0}
					<Empty.Root class="rounded-lg border">
						<Empty.Header><Empty.Title>No members.</Empty.Title></Empty.Header>
					</Empty.Root>
				{:else}
					<div
						class="hidden gap-x-4 px-1 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase sm:grid sm:grid-cols-[minmax(0,1fr)_6rem_10rem]"
						aria-hidden="true"
					>
						<span>Name</span><span>Role</span><span>Last seen</span>
					</div>
					<ul class="divide-y border-y">
						{#each visibleMembers as member (member.userId)}
							<li class="grid gap-x-4 gap-y-1 px-1 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_10rem] sm:items-center">
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

			<section class="grid gap-2" aria-labelledby="org-invitations">
				<PageShell.SectionHeader id="org-invitations" title="Pending invitations" size="compact" ruled />
				{#if org.invitations.length === 0}
					<Empty.Root class="rounded-lg border">
						<Empty.Header><Empty.Title>No pending invitations.</Empty.Title></Empty.Header>
					</Empty.Root>
				{:else}
					<ul class="divide-y border-b">
						{#each org.invitations as invitation (invitation.id)}
							<li class="grid gap-x-4 gap-y-1 px-1 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_14rem] sm:items-center">
								<span class="font-medium wrap-anywhere">{invitation.email}</span>
								<span
									><Badge variant={adminBadgeVariant(invitation.role)}>{formatAdminLabel(invitation.role)}</Badge></span
								>
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

			<section class="grid gap-2" aria-labelledby="org-activity">
				<PageShell.SectionHeader id="org-activity" title="Recent activity" size="compact" ruled />
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
						<ul class="divide-y border-b">
							{#each result.events as event (event.id)}
								<li class="grid gap-x-4 gap-y-1 px-1 py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
									<span class="wrap-anywhere">{describeAuditEvent(event, memberEmails)}</span>
									<time
										class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase sm:text-right"
										datetime={event.timestamp}
									>
										{formatDisplayDateTime(event.timestamp)}
									</time>
								</li>
							{/each}
						</ul>
					{/if}
				{/await}
			</section>
		</div>
	</div>
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
