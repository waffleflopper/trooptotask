<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Textarea } from '$lib/components/ui/textarea';
	import { invalidateAll } from '$app/navigation';
	import type { ActionData, PageData } from './$types';
	import GiftTierModal from '$lib/components/admin/GiftTierModal.svelte';
	import SuspendModal from '$lib/components/admin/SuspendModal.svelte';
	import TransferOwnershipModal from '$lib/components/admin/TransferOwnershipModal.svelte';
	import { adminBadgeVariant, adminPlanStatusBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { TIER_CONFIG, type Tier } from '$lib/types/subscription';
	import { formatDisplayDate, formatDisplayDateTime } from '$lib/utils/dates';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/ui/page-shell';
	import * as Table from '$lib/components/ui/table';

	let { data, form }: { data: PageData; form: ActionData } = $props();

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

	function billingSnapshotSourceLabel(source: string | null | undefined): string {
		switch (source) {
			case 'stripe':
				return 'Stripe subscription';
			case 'gift':
				return 'Admin gift';
			case 'billing_disabled':
				return 'Billing-disabled fallback';
			case 'legacy_organization':
				return 'Legacy organization';
			default:
				return 'Not configured';
		}
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

	<Card.Root id="billing-diagnostics">
		<Card.Header>
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="grid gap-1">
					<Card.Title>Billing Diagnostics</Card.Title>
					<Card.Description>Support-safe billing snapshot fields for cancellation and sync questions.</Card.Description>
				</div>
				<form method="POST" action="?/reconcileBilling">
					<Button type="submit" variant="outline" size="sm">Refresh from Stripe</Button>
				</form>
			</div>
		</Card.Header>
		<Card.Content class="grid gap-4">
			{#if form?.billingReconciliation}
				<Alert.Root variant={form.billingReconciliation.success ? 'success' : 'warning'}>
					<Alert.Title>{form.billingReconciliation.message}</Alert.Title>
					{#if form.billingReconciliation.diagnostics.length}
						<Alert.Description class="font-mono text-xs">
							{form.billingReconciliation.diagnostics.join(', ')}
						</Alert.Description>
					{/if}
				</Alert.Root>
			{/if}
			{#if data.billingSnapshot}
				<PageShell.FactGrid layout="three">
					<PageShell.FactRow label="Stripe Customer" layout="stack">
						<span class="font-mono text-xs break-all">{data.billingSnapshot.stripeCustomerId ?? '-'}</span>
					</PageShell.FactRow>
					<PageShell.FactRow label="Stripe Subscription" layout="stack">
						<span class="font-mono text-xs break-all">{data.billingSnapshot.stripeSubscriptionId ?? '-'}</span>
					</PageShell.FactRow>
					<PageShell.FactRow label="Stripe Price" layout="stack">
						<span class="font-mono text-xs break-all">{data.billingSnapshot.stripePriceId ?? '-'}</span>
					</PageShell.FactRow>
					<PageShell.FactRow label="Stripe Product" layout="stack">
						<span class="font-mono text-xs break-all">{data.billingSnapshot.stripeProductId ?? '-'}</span>
					</PageShell.FactRow>
					<PageShell.FactRow
						label="Subscription Source"
						value={billingSnapshotSourceLabel(data.billingSnapshot.source)}
						layout="stack"
					/>
					<PageShell.FactRow label="Subscription Status" layout="stack">
						<span>
							{formatAdminLabel(data.billingSnapshot.subscriptionStatus ?? 'unknown')}
						</span>
					</PageShell.FactRow>
					<PageShell.FactRow
						label="Collection Status"
						value={formatAdminLabel(data.billingSnapshot.collectionStatus ?? 'unknown')}
						layout="stack"
					/>
					<PageShell.FactRow
						label="Sync Status"
						value={formatAdminLabel(data.billingSnapshot.syncStatus)}
						layout="stack"
					/>
					<PageShell.FactRow
						label="Cancellation"
						value={data.cancellationSummary?.label ?? 'Not scheduled'}
						layout="stack"
					/>
					<PageShell.FactRow
						label="Paid Through"
						value={formatOptionalDateTime(data.billingSnapshot.currentPeriodEnd)}
						layout="stack"
					/>
					<PageShell.FactRow
						label="Canceled At"
						value={formatOptionalDateTime(data.billingSnapshot.canceledAt)}
						layout="stack"
					/>
					<PageShell.FactRow label="Last Stripe Event" layout="stack">
						<span class="font-mono text-xs break-all">{data.billingSnapshot.lastStripeEventId ?? '-'}</span>
					</PageShell.FactRow>
					<PageShell.FactRow label="Last Event Type" layout="stack">
						<span class="font-mono text-xs break-all">{data.billingSnapshot.lastStripeEventType ?? '-'}</span>
					</PageShell.FactRow>
					<PageShell.FactRow
						label="Last Event Created"
						value={formatOptionalDateTime(data.billingSnapshot.lastStripeEventCreatedAt)}
						layout="stack"
					/>
					<PageShell.FactRow
						label="Last Processed"
						value={formatOptionalDateTime(data.billingSnapshot.lastProcessedAt)}
						layout="stack"
					/>
					<PageShell.FactRow
						label="Last Reconciled"
						value={formatOptionalDateTime(data.billingSnapshot.lastReconciledAt)}
						layout="stack"
					/>
					<PageShell.FactRow label="Reconciliation Result" layout="stack">
						<span class="min-w-0 font-mono text-xs break-all">{data.billingSnapshot.reconciliationResult ?? '-'}</span>
					</PageShell.FactRow>
					<PageShell.FactRow
						label="Drift Detected"
						value={data.billingSnapshot.driftDetected ? 'Yes' : 'No'}
						layout="stack"
					/>
				</PageShell.FactGrid>
			{:else}
				<Empty.Root class="border-0">No billing snapshot has been recorded for this organization.</Empty.Root>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Plan Policy Diagnostics</Card.Title>
			<Card.Description
				>Effective limits, usage, feature sources, and over-limit reasons for support review.</Card.Description
			>
		</Card.Header>
		<Card.Content class="grid gap-4">
			<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				<div class="grid gap-1">
					<span class="text-xs font-medium text-muted-foreground">Effective Plan</span>
					<span>{formatAdminLabel(data.planDiagnostics.effectivePlan.tier)}</span>
				</div>
				<div class="grid gap-1">
					<span class="text-xs font-medium text-muted-foreground">Commercial Plan</span>
					<span>{formatAdminLabel(data.planDiagnostics.effectivePlan.commercialPlan)}</span>
				</div>
				<div class="grid gap-1">
					<span class="text-xs font-medium text-muted-foreground">Entitlement Source</span>
					<span>{data.planDiagnostics.effectivePlan.sourceLabel}</span>
				</div>
				<div class="grid gap-1">
					<span class="text-xs font-medium text-muted-foreground">Billing Source</span>
					<span>{formatAdminLabel(data.planDiagnostics.effectivePlan.billingSource)}</span>
				</div>
				<div class="grid gap-1">
					<span class="text-xs font-medium text-muted-foreground">Grace Mode</span>
					<span>{formatAdminLabel(data.planDiagnostics.grace.mode)}</span>
				</div>
				<div class="grid gap-1">
					<span class="text-xs font-medium text-muted-foreground">Read-only</span>
					<span>{data.planDiagnostics.readOnly.enabled ? 'Yes' : 'No'}</span>
				</div>
			</div>

			{#if data.planDiagnostics.grace.message}
				<p class="rounded-md border bg-muted/30 px-3 py-2 text-sm">{data.planDiagnostics.grace.message}</p>
			{/if}

			<div class="overflow-x-auto">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Usage</Table.Head>
							<Table.Head>Count</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head>Reason</Table.Head>
							<Table.Head>Remediation</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.planDiagnostics.usageRows as row (row.dimension)}
							<Table.Row>
								<Table.Cell>{row.label}</Table.Cell>
								<Table.Cell>{row.used} / {row.limitLabel}</Table.Cell>
								<Table.Cell>
									<Badge variant={adminPlanStatusBadgeVariant(row.status)}>{formatAdminLabel(row.status)}</Badge>
								</Table.Cell>
								<Table.Cell>{row.message}</Table.Cell>
								<Table.Cell>{row.remediation}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>

			{#if data.planDiagnostics.overLimitReasons.length > 0}
				<div class="grid gap-2">
					<p class="text-sm font-medium">Over-limit and read-only reasons</p>
					<ul class="grid gap-2 text-sm">
						{#each data.planDiagnostics.overLimitReasons as reason (`${reason.dimension}-${reason.status}`)}
							<li class="rounded-md border px-3 py-2">
								<div class="flex flex-wrap items-center gap-2">
									<span class="font-medium">{reason.label}</span>
									<Badge variant={adminPlanStatusBadgeVariant(reason.status)}>{formatAdminLabel(reason.status)}</Badge>
									<span class="text-xs text-muted-foreground">{reason.sourceLabel}</span>
								</div>
								<p class="mt-1 text-muted-foreground">{reason.message}</p>
								<p class="mt-1 font-medium">{reason.remediation}</p>
							</li>
						{/each}
					</ul>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No over-limit or read-only reasons are active.</p>
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

	<Card.Root>
		<Card.Header>
			<Card.Title>Plan Entitlements</Card.Title>
			<Card.Description>Effective feature access with its billing or override source.</Card.Description>
		</Card.Header>
		<Card.Content class="overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Feature</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Source</Table.Head>
						<Table.Head>Upgrade</Table.Head>
						<Table.Head>Override</Table.Head>
						{#if data.adminRole === 'super_admin'}
							<Table.Head>Actions</Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.planDiagnostics.entitlements as entitlement (entitlement.key)}
						<Table.Row>
							<Table.Cell>
								<div class="grid gap-1">
									<span>{entitlement.label}</span>
									<span class="max-w-[34rem] whitespace-normal text-sm text-muted-foreground">
										{entitlement.description}
									</span>
								</div>
							</Table.Cell>
							<Table.Cell>
								<Badge variant={entitlement.available ? 'success' : 'secondary'}>
									{entitlement.available ? 'Available' : 'Unavailable'}
								</Badge>
							</Table.Cell>
							<Table.Cell>
								<Badge variant={adminBadgeVariant(entitlement.source)}>{entitlement.sourceLabel}</Badge>
							</Table.Cell>
							<Table.Cell>
								{entitlement.upgradeTarget ? formatAdminLabel(entitlement.upgradeTarget) : '-'}
							</Table.Cell>
							<Table.Cell>
								{#if entitlement.override}
									<div class="grid gap-1">
										<span>{formatAdminLabel(entitlement.override.state)}</span>
										<span class="font-mono text-xs text-muted-foreground">
											{formatOptionalDateTime(entitlement.override.expiresAt)}
										</span>
									</div>
								{:else}
									<span class="text-muted-foreground">-</span>
								{/if}
							</Table.Cell>
							{#if data.adminRole === 'super_admin'}
								<Table.Cell>
									{#if entitlement.override}
										<form method="POST" action="?/revokeFeatureOverride">
											<input type="hidden" name="overrideId" value={entitlement.override.id} />
											<Button type="submit" variant="outline" size="sm">Revoke</Button>
										</form>
									{:else}
										<span class="text-muted-foreground">-</span>
									{/if}
								</Table.Cell>
							{/if}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
			{#if data.adminRole === 'super_admin'}
				<form method="POST" action="?/setFeatureOverride" class="mt-5 border-t pt-4">
					<div class="mb-3">
						<h3 class="text-sm font-medium">Set Feature Override</h3>
						<p class="text-sm text-muted-foreground">
							Grant or deny feature access outside the organization's current plan.
						</p>
					</div>
					<div
						class="grid gap-3 lg:grid-cols-[minmax(12rem,1.2fr)_8rem_minmax(13rem,1fr)_minmax(16rem,1.4fr)_auto] lg:items-start"
					>
						<label class="grid gap-1.5 text-sm font-medium">
							Feature
							<NativeSelect name="featureKey" class="w-full">
								{#each data.planDiagnostics.entitlements as entitlement (entitlement.key)}
									<option value={entitlement.key}>{entitlement.label}</option>
								{/each}
							</NativeSelect>
						</label>
						<label class="grid gap-1.5 text-sm font-medium">
							Override
							<NativeSelect name="state" class="w-full">
								<option value="granted">Grant</option>
								<option value="denied">Deny</option>
							</NativeSelect>
						</label>
						<label class="grid gap-1.5 text-sm font-medium">
							Expires
							<Input type="datetime-local" name="expiresAt" />
						</label>
						<label class="grid gap-1.5 text-sm font-medium">
							Reason
							<Textarea name="reason" maxlength={500} placeholder="Optional support note" class="min-h-8 resize-y"
							></Textarea>
						</label>
						<Button type="submit" class="w-full lg:mt-[1.875rem] lg:w-auto">Set Override</Button>
					</div>
				</form>
			{/if}
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
