<script lang="ts">
	import { onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import SuspendModal from '$features/platform-admin/components/SuspendModal.svelte';
	import TransferOwnershipModal from '$features/platform-admin/components/TransferOwnershipModal.svelte';
	import OrganizationActivitySkeleton from '$features/platform-admin/components/OrganizationActivitySkeleton.svelte';
	import AdminPage from '$features/platform-admin/components/AdminPage.svelte';
	import AdminPageHeader from '$features/platform-admin/components/AdminPageHeader.svelte';
	import { adminBadgeVariant, formatAdminLabel } from '$features/platform-admin/components/adminTheme';
	import { describeAuditEvent } from '$features/platform-admin/auditSentences';
	import { PLATFORM_ORGANIZATION_STATUS_LABELS } from '$features/platform-admin/organizationSupportTypes';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
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

{#snippet commands()}
	<div class="flex flex-wrap items-center gap-2 sm:justify-end">
		<Button variant="outline" onclick={() => (showTransferModal = true)}>Transfer ownership</Button>
		<Button variant={isSuspended ? 'outline' : 'destructive'} onclick={() => (showSuspendModal = true)}>
			{isSuspended ? 'Unsuspend organization' : 'Suspend organization'}
		</Button>
	</div>
{/snippet}

<AdminPage>
	<AdminPageHeader
		eyebrow={`Organization · ${PLATFORM_ORGANIZATION_STATUS_LABELS[org.status]} · Created ${formatDisplayDate(org.createdAt)}`}
		title={org.name}
		description={ownerSentence}
		{commands}
	/>

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

	<div class="grid items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
		<aside aria-labelledby="org-glance" class="rounded-xl border border-border bg-card p-5 lg:order-2">
			<h2 id="org-glance" class="mb-2 font-heading text-xl leading-none font-bold">At a glance</h2>
			<dl>
				<PageShell.FactRow variant="compact" label="Owner" value={ownerLabel} />
				<PageShell.FactRow variant="compact" label="Members" value={String(org.members.length)} />
				<PageShell.FactRow variant="compact" label="Personnel" value={String(org.personnelCount)} />
				<PageShell.FactRow
					variant="compact"
					label="Last active"
					value={org.lastActiveAt ? formatRelativeDate(org.lastActiveAt) : 'Never used'}
				/>
				<PageShell.FactRow variant="compact" label="Created" value={formatDisplayDate(org.createdAt)} />
				<PageShell.FactRow variant="compact" label="Status" value={PLATFORM_ORGANIZATION_STATUS_LABELS[org.status]} />
				<PageShell.FactRow variant="compact" label="ID" value={org.id} mono />
			</dl>
		</aside>

		<div class="grid min-w-0 gap-9 lg:order-1">
			<section class="grid gap-3" aria-labelledby="org-members">
				<div class="flex items-baseline justify-between gap-3">
					<h2 id="org-members" class="font-heading text-xl leading-none font-bold">Members · {org.members.length}</h2>
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
				</div>
				{#if org.members.length === 0}
					<p class="border-t border-foreground py-3 text-sm text-muted-foreground">No members.</p>
				{:else}
					<div
						class="hidden gap-x-4 border-t border-b border-foreground px-3 py-2 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase sm:grid sm:grid-cols-[minmax(0,1fr)_6rem_10rem]"
						aria-hidden="true"
					>
						<span>Name</span><span>Role</span><span>Last seen</span>
					</div>
					<ul class="max-sm:border-t max-sm:border-foreground">
						{#each visibleMembers as member (member.userId)}
							<li
								class="grid gap-x-4 gap-y-1 border-b border-border px-3 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_10rem] sm:items-center"
							>
								<a
									href={resolve(`/admin/people/${member.userId}` as `/admin/people/${string}`)}
									class="font-semibold wrap-anywhere text-foreground underline-offset-4 hover:underline"
									>{member.email ?? '(unknown)'}</a
								>
								<span><Badge variant={adminBadgeVariant(member.role)} mono>{formatAdminLabel(member.role)}</Badge></span
								>
								<span class="text-sm text-muted-foreground">
									{member.lastSignInAt ? `Signed in ${formatRelativeDate(member.lastSignInAt)}` : 'Never signed in'}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="grid gap-3" aria-labelledby="org-invitations">
				<h2 id="org-invitations" class="font-heading text-xl leading-none font-bold">Pending invitations</h2>
				{#if org.invitations.length === 0}
					<p class="border-t border-foreground py-3 text-sm text-muted-foreground">No pending invitations.</p>
				{:else}
					<ul class="border-t border-foreground">
						{#each org.invitations as invitation (invitation.id)}
							<li
								class="grid gap-x-4 gap-y-1 border-b border-border px-3 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_14rem] sm:items-center"
							>
								<span class="font-semibold wrap-anywhere">{invitation.email}</span>
								<span
									><Badge variant={adminBadgeVariant(invitation.role)} mono>{formatAdminLabel(invitation.role)}</Badge
									></span
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

			<section class="grid gap-3" aria-labelledby="org-activity">
				<div class="flex items-baseline justify-between gap-3">
					<h2 id="org-activity" class="font-heading text-xl leading-none font-bold">Recent activity</h2>
					<a
						href={resolve(`/admin/activity?q=${encodeURIComponent(org.name)}` as '/admin/activity')}
						class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase underline-offset-4 hover:underline"
					>
						Open in Activity →
					</a>
				</div>
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
						<p class="border-t border-foreground py-3 text-sm text-muted-foreground">
							No activity recorded for this Organization.
						</p>
					{:else}
						<ul class="border-t border-foreground">
							{#each result.events as event (event.id)}
								<li
									class="grid gap-x-4 gap-y-1 border-b border-border px-3 py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center"
								>
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
</AdminPage>

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
