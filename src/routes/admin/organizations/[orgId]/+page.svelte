<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { invalidateAll } from '$app/navigation';
	import GiftTierModal from '$lib/components/admin/GiftTierModal.svelte';
	import SuspendModal from '$lib/components/admin/SuspendModal.svelte';
	import TransferOwnershipModal from '$lib/components/admin/TransferOwnershipModal.svelte';
	import { adminBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';
	import { Badge } from '$lib/components/ui/badge';
	import { TIER_CONFIG, type Tier } from '$lib/types/subscription';
	import { formatDisplayDate, formatDisplayDateTime } from '$lib/utils/dates';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/ui/page-shell';
	import * as Table from '$lib/components/ui/table';

	let { data } = $props();

	function formatPersonnelCap(tier: string): string {
		const config = TIER_CONFIG[tier as Tier];
		if (!config) return '?';
		return config.personnelCap === Infinity ? 'Unlimited' : String(config.personnelCap);
	}

	let showSuspendModal = $state(false);
	let showTransferModal = $state(false);
	let showGiftModal = $state(false);

	async function handleSuspendComplete() {
		showSuspendModal = false;
		await invalidateAll();
	}

	async function handleTransferComplete() {
		showTransferModal = false;
		await invalidateAll();
	}

	async function handleGiftComplete() {
		showGiftModal = false;
		await invalidateAll();
	}

	function formatOptionalDateTime(value: string | null | undefined): string {
		return value ? formatDisplayDateTime(value) : '-';
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
			<Badge variant={adminBadgeVariant(data.org.effectiveTier)}>{formatAdminLabel(data.org.effectiveTier)}</Badge>
			{#if data.org.giftTier}<Badge variant="warning">Gifted</Badge>{/if}
			<Badge variant={adminBadgeVariant(data.org.isSuspended ? 'suspended' : 'active')}>
				{data.org.isSuspended ? 'Suspended' : 'Active'}
			</Badge>
		{/snippet}
	</PageShell.Header>

	<div class="flex flex-wrap gap-2">
		<Button variant="outline" onclick={() => (showGiftModal = true)}>Gift Tier</Button>
		<Button variant="outline" onclick={() => (showTransferModal = true)}>Transfer Ownership</Button>
		<Button variant={data.org.isSuspended ? 'outline' : 'destructive'} onclick={() => (showSuspendModal = true)}>
			{data.org.isSuspended ? 'Unsuspend' : 'Suspend'}
		</Button>
	</div>

	<PageShell.FactGrid layout="three">
		<PageShell.Metric
			label="Effective Tier"
			value={formatAdminLabel(data.org.effectiveTier)}
			detail="Base subscription plus any active gifted override."
		/>
		<PageShell.Metric label="Personnel" value={data.personnelCount}>
			{data.personnelCount} of {formatPersonnelCap(data.org.effectiveTier)} slots currently used.
		</PageShell.Metric>
		<PageShell.Metric
			label="Gift Expires"
			value={data.org.giftExpiresAt ? formatDisplayDate(data.org.giftExpiresAt) : 'None'}
			detail="Current gifted plan expiry if one is active."
		/>
	</PageShell.FactGrid>

	<div class="grid gap-4 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Subscription</Card.Title>
				<Card.Description>Plan and suspension state for this organization.</Card.Description>
			</Card.Header>
			<Card.Content>
				<dl class="grid gap-3">
					<div class="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0">
						<dt class="text-xs font-medium text-muted-foreground">Tier</dt>
						<dd>
							<Badge variant={adminBadgeVariant(data.org.effectiveTier)}
								>{formatAdminLabel(data.org.effectiveTier)}</Badge
							>
						</dd>
					</div>
					<div class="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0">
						<dt class="text-xs font-medium text-muted-foreground">Base Tier</dt>
						<dd>{formatAdminLabel(data.org.subscriptionTier)}</dd>
					</div>
					<div class="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0">
						<dt class="text-xs font-medium text-muted-foreground">Personnel Count</dt>
						<dd>{data.personnelCount} / {formatPersonnelCap(data.org.effectiveTier)}</dd>
					</div>
					<div class="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0">
						<dt class="text-xs font-medium text-muted-foreground">Member Since</dt>
						<dd>{formatDisplayDate(data.org.createdAt)}</dd>
					</div>
					{#if data.org.giftTier}
						<div class="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0">
							<dt class="text-xs font-medium text-muted-foreground">Gift Tier</dt>
							<dd>
								<Badge variant={adminBadgeVariant(data.org.giftTier)}>{formatAdminLabel(data.org.giftTier)}</Badge>
							</dd>
						</div>
						<div class="flex items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0">
							<dt class="text-xs font-medium text-muted-foreground">Gift Expires</dt>
							<dd>{data.org.giftExpiresAt ? formatDisplayDate(data.org.giftExpiresAt) : 'Never'}</dd>
						</div>
					{/if}
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
			<Card.Title>Billing Diagnostics</Card.Title>
			<Card.Description>Support-safe billing snapshot fields for cancellation and sync questions.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.billingSnapshot}
				<dl class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					<div class="grid gap-1">
						<dt class="text-xs font-medium text-muted-foreground">Stripe Customer</dt>
						<dd class="break-words font-mono text-xs">{data.billingSnapshot.stripeCustomerId ?? '-'}</dd>
					</div>
					<div class="grid gap-1">
						<dt class="text-xs font-medium text-muted-foreground">Stripe Subscription</dt>
						<dd class="break-words font-mono text-xs">{data.billingSnapshot.stripeSubscriptionId ?? '-'}</dd>
					</div>
					<div class="grid gap-1">
						<dt class="text-xs font-medium text-muted-foreground">Stripe Price</dt>
						<dd class="break-words font-mono text-xs">{data.billingSnapshot.stripePriceId ?? '-'}</dd>
					</div>
					<div class="grid gap-1">
						<dt class="text-xs font-medium text-muted-foreground">Subscription Status</dt>
						<dd>{formatAdminLabel(data.billingSnapshot.subscriptionStatus ?? 'unknown')}</dd>
					</div>
					<div class="grid gap-1">
						<dt class="text-xs font-medium text-muted-foreground">Collection Status</dt>
						<dd>{formatAdminLabel(data.billingSnapshot.collectionStatus ?? 'unknown')}</dd>
					</div>
					<div class="grid gap-1">
						<dt class="text-xs font-medium text-muted-foreground">Sync Status</dt>
						<dd>{formatAdminLabel(data.billingSnapshot.syncStatus)}</dd>
					</div>
					<div class="grid gap-1">
						<dt class="text-xs font-medium text-muted-foreground">Cancellation</dt>
						<dd>{data.cancellationSummary?.label ?? 'Not scheduled'}</dd>
					</div>
					<div class="grid gap-1">
						<dt class="text-xs font-medium text-muted-foreground">Paid Through</dt>
						<dd>{formatOptionalDateTime(data.billingSnapshot.currentPeriodEnd)}</dd>
					</div>
					<div class="grid gap-1">
						<dt class="text-xs font-medium text-muted-foreground">Canceled At</dt>
						<dd>{formatOptionalDateTime(data.billingSnapshot.canceledAt)}</dd>
					</div>
					<div class="grid gap-1">
						<dt class="text-xs font-medium text-muted-foreground">Last Stripe Event</dt>
						<dd class="break-words font-mono text-xs">{data.billingSnapshot.lastStripeEventId ?? '-'}</dd>
					</div>
					<div class="grid gap-1">
						<dt class="text-xs font-medium text-muted-foreground">Last Event Type</dt>
						<dd class="break-words font-mono text-xs">{data.billingSnapshot.lastStripeEventType ?? '-'}</dd>
					</div>
					<div class="grid gap-1">
						<dt class="text-xs font-medium text-muted-foreground">Last Processed</dt>
						<dd>{formatOptionalDateTime(data.billingSnapshot.lastProcessedAt)}</dd>
					</div>
				</dl>
			{:else}
				<Empty.Root class="border-0">No billing snapshot has been recorded for this organization.</Empty.Root>
			{/if}
		</Card.Content>
	</Card.Root>

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

{#if showGiftModal}
	<GiftTierModal
		orgId={data.org.id}
		orgName={data.org.name}
		currentGiftTier={data.org.giftTier}
		giftExpiresAt={data.org.giftExpiresAt}
		onClose={() => (showGiftModal = false)}
		onComplete={handleGiftComplete}
	/>
{/if}
