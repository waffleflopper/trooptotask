<script lang="ts">
	import { onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import SuspendModal from '$features/platform-admin/components/SuspendModal.svelte';
	import TransferOwnershipModal from '$features/platform-admin/components/TransferOwnershipModal.svelte';
	import { adminBadgeVariant, formatAdminLabel } from '$features/platform-admin/components/adminTheme';
	import { Badge } from '$lib/components/ui/badge';
	import { formatDisplayDate, formatDisplayDateTime } from '$lib/utils/dates';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import {
		WorkspaceToolbar,
		type ToolbarItem,
		type WorkspaceToolbarProps
	} from '$lib/components/patterns/workspace-toolbar';
	import * as Table from '$lib/components/ui/table';

	let { data }: { data: PageData } = $props();

	let showSuspendModal = $state(false);
	let showTransferModal = $state(false);
	let navigationLifetime = $state(0);
	const canAdminister = true;
	const toolbarItems = $derived<ToolbarItem[]>(
		canAdminister
			? [
					{
						kind: 'action',
						id: 'suspend',
						label: data.org.isSuspended ? 'Unsuspend' : 'Suspend',
						destructive: !data.org.isSuspended,
						menuOnly: true,
						onclick: () => (showSuspendModal = true)
					}
				]
			: []
	);
	const toolbarPrimary = $derived<WorkspaceToolbarProps['primary']>(
		canAdminister
			? { kind: 'action', id: 'transfer', label: 'Transfer Ownership', onclick: () => (showTransferModal = true) }
			: undefined
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
		if (orgId !== data.org.id || lifetime !== navigationLifetime) throw new Error('Organization is no longer current');
		await invalidateAll();
		if (orgId !== data.org.id || lifetime !== navigationLifetime) throw new Error('Organization is no longer current');
	}

	async function reloadSuspension(lifetime: number, orgId: string): Promise<boolean> {
		await refreshOrganization(orgId, lifetime);
		if (orgId !== data.org.id || lifetime !== navigationLifetime) throw new Error('Organization is no longer current');
		if (typeof data.org.isSuspended !== 'boolean') throw new Error('Organization state could not be refreshed');
		return data.org.isSuspended;
	}

	async function handleSuspendComplete(lifetime: number, targetId: string, isSuspended: boolean) {
		if (targetId !== data.org.id || lifetime !== navigationLifetime) return;
		if ((await reloadSuspension(lifetime, targetId)) !== isSuspended)
			throw new Error('Organization state could not be refreshed');
		if (targetId !== data.org.id || lifetime !== navigationLifetime) return;
		showSuspendModal = false;
	}

	async function reloadOwnership(lifetime: number, orgId: string, targetUserId: string) {
		await refreshOrganization(orgId, lifetime);
		if (orgId !== data.org.id || lifetime !== navigationLifetime) throw new Error('Organization is no longer current');
		const owners = data.members.filter((member) => member.role === 'owner');
		if (owners.length !== 1) throw new Error('Ownership could not be refreshed');
		return {
			ownerUserId: owners[0].userId,
			targetIsEligible: data.members.some(
				(member) => member.userId === targetUserId && (member.role === 'member' || member.role === 'admin')
			)
		};
	}

	async function handleTransferComplete(lifetime: number, orgId: string, targetUserId: string) {
		if (orgId !== data.org.id || lifetime !== navigationLifetime) return;
		const current = await reloadOwnership(lifetime, orgId, targetUserId);
		if (orgId !== data.org.id || lifetime !== navigationLifetime) return;
		if (current.ownerUserId !== targetUserId) throw new Error('Ownership could not be refreshed');
		showTransferModal = false;
	}
</script>

<svelte:head>
	<title>{data.org.name} - Organizations - Admin - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide">
	<PageShell.Header
		title={data.org.name}
		subtitle={`Created ${formatDisplayDate(data.org.createdAt)} - ${data.members.length} member${
			data.members.length === 1 ? '' : 's'
		} - ${data.personnelCount} personnel`}
	>
		{#snippet back()}
			<Button href="/admin/organizations" variant="ghost" size="sm">Back to Organizations</Button>
		{/snippet}
		{#snippet meta()}
			<Badge variant="secondary">Organization Record</Badge>
			<Badge variant={adminBadgeVariant(data.org.isSuspended ? 'suspended' : 'active')}>
				{data.org.isSuspended ? 'Suspended' : 'Active'}
			</Badge>
		{/snippet}
	</PageShell.Header>

	{#if canAdminister}
		<WorkspaceToolbar ariaLabel="Organization controls" items={toolbarItems} primary={toolbarPrimary} />
	{/if}

	<div class="grid gap-4 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Organization</Card.Title>
				<Card.Description>Organization details and suspension status.</Card.Description>
			</Card.Header>
			<Card.Content>
				<dl class="grid gap-3">
					<div class="flex items-center justify-between gap-3">
						<dt class="text-xs font-medium text-muted-foreground">Personnel Count</dt>
						<dd>{data.personnelCount}</dd>
					</div>
					<div class="flex items-center justify-between gap-3 border-t pt-3">
						<dt class="text-xs font-medium text-muted-foreground">Created</dt>
						<dd>{formatDisplayDate(data.org.createdAt)}</dd>
					</div>
					{#if data.org.isSuspended}
						<div class="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0">
							<dt class="text-xs font-medium text-muted-foreground">Suspended At</dt>
							<dd class="text-destructive">{formatDisplayDateTime(data.org.suspendedAt)}</dd>
						</div>
					{/if}
				</dl>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Members</Card.Title>
				<Card.Description>Current membership roster for this organization.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-3">
				{#each data.members as member (member.userId)}
					<div class="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0">
						<a
							href={resolve(`/admin/users/${member.userId}` as `/admin/users/${string}`)}
							class="break-words text-sm font-medium underline-offset-4 hover:underline"
						>
							{member.email}
						</a>
						<Badge variant={adminBadgeVariant(member.role)}>{formatAdminLabel(member.role)}</Badge>
					</div>
				{:else}
					<Empty.Root>No members found.</Empty.Root>
				{/each}
			</Card.Content>
		</Card.Root>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Recent Audit Events</Card.Title>
			<Card.Description>Latest platform activity recorded against this organization.</Card.Description>
		</Card.Header>
		<Card.Content class="overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Timestamp</Table.Head>
						<Table.Head>Action</Table.Head>
						<Table.Head>Resource</Table.Head>
						<Table.Head>Severity</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.auditEvents as evt (evt.id)}
						<Table.Row>
							<Table.Cell class="font-mono text-xs text-muted-foreground"
								>{formatDisplayDateTime(evt.timestamp)}</Table.Cell
							>
							<Table.Cell><span class="font-mono text-xs">{evt.action}</span></Table.Cell>
							<Table.Cell>
								{evt.resourceType ?? ''}{#if evt.resourceId}
									<span class="text-muted-foreground"> - {evt.resourceId.slice(0, 8)}...</span>
								{/if}
							</Table.Cell>
							<Table.Cell
								><Badge variant={adminBadgeVariant(evt.severity)}>{formatAdminLabel(evt.severity)}</Badge></Table.Cell
							>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={4}>
								<Empty.Root class="border-0">No audit events recorded for this organization.</Empty.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</PageShell.Root>

{#if canAdminister && showSuspendModal}
	<SuspendModal
		type="org"
		targetId={data.org.id}
		targetName={data.org.name}
		isSuspended={data.org.isSuspended}
		onClose={() => (showSuspendModal = false)}
		onComplete={handleSuspendComplete.bind(null, navigationLifetime)}
		onReload={reloadSuspension.bind(null, navigationLifetime)}
	/>
{/if}

{#if canAdminister && showTransferModal}
	<TransferOwnershipModal
		orgId={data.org.id}
		orgName={data.org.name}
		members={data.members}
		onClose={() => (showTransferModal = false)}
		onComplete={handleTransferComplete.bind(null, navigationLifetime)}
		onReload={reloadOwnership.bind(null, navigationLifetime)}
	/>
{/if}
