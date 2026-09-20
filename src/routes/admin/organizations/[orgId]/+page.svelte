<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import SuspendModal from '$lib/components/admin/SuspendModal.svelte';
	import TransferOwnershipModal from '$lib/components/admin/TransferOwnershipModal.svelte';
	import { adminBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';
	import { Badge } from '$lib/components/ui/badge';
	import { formatDisplayDate, formatDisplayDateTime } from '$lib/utils/dates';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/ui/page-shell';
	import * as Table from '$lib/components/ui/table';

	let { data }: { data: PageData } = $props();

	let showSuspendModal = $state(false);
	let showTransferModal = $state(false);

	async function handleSuspendComplete() {
		showSuspendModal = false;
		await invalidateAll();
	}

	async function handleTransferComplete() {
		showTransferModal = false;
		await invalidateAll();
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
		{/snippet}
		{#snippet actions()}
			<Badge variant={adminBadgeVariant(data.org.isSuspended ? 'suspended' : 'active')}>
				{data.org.isSuspended ? 'Suspended' : 'Active'}
			</Badge>
		{/snippet}
	</PageShell.Header>

	<div class="flex flex-wrap gap-2">
		<Button variant="outline" onclick={() => (showTransferModal = true)}>Transfer Ownership</Button>
		<Button variant={data.org.isSuspended ? 'outline' : 'destructive'} onclick={() => (showSuspendModal = true)}>
			{data.org.isSuspended ? 'Unsuspend' : 'Suspend'}
		</Button>
	</div>

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

{#if showSuspendModal}
	<SuspendModal
		type="org"
		targetId={data.org.id}
		targetName={data.org.name}
		isSuspended={data.org.isSuspended}
		onClose={() => (showSuspendModal = false)}
		onComplete={handleSuspendComplete}
	/>
{/if}

{#if showTransferModal}
	<TransferOwnershipModal
		orgId={data.org.id}
		orgName={data.org.name}
		members={data.members}
		onClose={() => (showTransferModal = false)}
		onComplete={handleTransferComplete}
	/>
{/if}
