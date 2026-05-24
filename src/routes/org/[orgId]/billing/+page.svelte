<script lang="ts">
	import { Check, Gift, TriangleAlert } from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as PageShell from '$lib/components/ui/page-shell';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import { redirectToSensitiveActionStepUp } from '$lib/auth/sensitiveActionStepUp';
	import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
	import type {
		BillingSnapshot,
		BillingSnapshotSource,
		EffectiveTier,
		SubscriptionStatus,
		Tier
	} from '$lib/types/subscription';

	type BillingApiResult = {
		url?: string;
		error?: string;
		requiresStepUp?: boolean;
		stepUpPath?: string | null;
	};

	type PendingBillingAction = { kind: 'subscribe'; tier: string } | { kind: 'portal' } | { kind: 'cancel' };

	type ConfirmSensitiveActionResult = {
		success?: boolean;
		error?: string;
		requiresStepUp?: boolean;
		stepUpPath?: string | null;
	};

	let { data }: { data: PageData } = $props();

	let subscribingTier = $state<string | null>(null);
	let portalLoading = $state(false);
	let cancelLoading = $state(false);
	let errorMessage = $state('');
	let confirmPasswordOpen = $state(false);
	let confirmPassword = $state('');
	let confirmPasswordError = $state('');
	let confirmPasswordLoading = $state(false);
	let pendingBillingAction = $state<PendingBillingAction | null>(null);

	const fallbackTier: EffectiveTier = {
		tier: 'free',
		source: 'default',
		personnelCount: 0,
		personnelCap: 20,
		isReadOnly: false,
		readOnlyReason: null,
		giftExpiresAt: null,
		giftTier: null
	};

	const tier = $derived<EffectiveTier>(data.effectiveTier ?? fallbackTier);
	const tierComparison = $derived(data.tierComparison ?? []);
	const source = $derived(tier.source);
	const isReadOnly = $derived(tier.isReadOnly);
	const readOnlyReason = $derived(tier.readOnlyReason ?? null);
	const personnelCount = $derived(tier.personnelCount);
	const personnelCap = $derived(tier.personnelCap);
	const giftExpiresAt = $derived(tier.giftExpiresAt);
	const giftTier = $derived(tier.giftTier);
	const billingSnapshot = $derived<BillingSnapshot | null>(data.billingSnapshot ?? null);
	const cancellationSummary = $derived(data.cancellationSummary ?? null);
	const planUsageSummary = $derived(data.planUsageSummary ?? null);
	const downgradePreviews = $derived(data.downgradePreviews ?? []);
	const showCancellationTiming = $derived(
		!!cancellationSummary && cancellationSummary.state !== 'none' && source !== 'gift'
	);
	const billingStatus = $derived(buildBillingStatus(billingSnapshot, tier));
	const billingActionsDisabled = $derived(
		source === 'billing_disabled' || billingSnapshot?.source === 'billing_disabled'
	);

	const giftDaysRemaining = $derived.by(() => {
		if (!giftExpiresAt) return null;
		const diff = new Date(giftExpiresAt).getTime() - Date.now();
		return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
	});
	const billingToolbarActions = $derived.by(() => {
		if (!data.canManageSubscription || billingActionsDisabled) return [];

		const actions: WorkspaceToolbarAction[] = [
			{
				id: 'cancel-subscription',
				label: cancelLoading ? 'Canceling...' : 'Cancel Subscription',
				onclick: handleCancelSubscription,
				disabled: cancelLoading,
				priority: 'low',
				variant: 'danger'
			},
			{
				id: 'manage-subscription',
				label: portalLoading ? 'Opening...' : 'Manage Subscription',
				onclick: handleManageSubscription,
				disabled: portalLoading,
				priority: 'critical',
				overflow: 'never',
				variant: 'primary'
			}
		];

		return actions;
	});

	function formatPrice(cents: number): string {
		if (cents === 0) return 'Free';
		return `$${(cents / 100).toFixed(0)}/mo`;
	}

	function formatCap(cap: number | null): string {
		return cap === null ? 'Unlimited' : String(cap);
	}

	function sourceLabel(src: string): string {
		switch (src) {
			case 'subscription':
				return 'Stripe Subscription';
			case 'gift':
				return 'Admin Gift';
			case 'billing_disabled':
				return 'Billing Disabled';
			case 'default':
				return 'Free Plan';
			default:
				return src;
		}
	}

	function snapshotSourceLabel(src: BillingSnapshotSource | null | undefined): string {
		switch (src) {
			case 'stripe':
				return 'Stripe';
			case 'gift':
				return 'Admin Gift';
			case 'billing_disabled':
				return 'Billing Disabled';
			case 'legacy_organization':
				return 'Legacy Organization';
			default:
				return 'Not Configured';
		}
	}

	function subscriptionStatusLabel(status: SubscriptionStatus | null | undefined): string {
		switch (status) {
			case 'active':
				return 'Active';
			case 'trialing':
				return 'Trialing';
			case 'past_due':
				return 'Past Due';
			case 'unpaid':
				return 'Unpaid';
			case 'canceled':
				return 'Canceled';
			case 'incomplete':
				return 'Payment Pending';
			case 'incomplete_expired':
				return 'Checkout Expired';
			case 'paused':
				return 'Paused';
			default:
				return 'Free';
		}
	}

	function syncHealthLabel(snapshot: BillingSnapshot | null): string {
		if (!snapshot) return 'Current';
		if (snapshot.syncStatus === 'synced') return 'Current';
		return snapshot.driftDetected || snapshot.syncStatus === 'needs_reconciliation'
			? 'Needs support review'
			: 'Current';
	}

	function buildBillingStatus(
		snapshot: BillingSnapshot | null,
		effective: EffectiveTier
	): {
		title: string;
		description: string;
		statusLabel: string;
		variant: BadgeVariant;
		actionHint: string;
	} {
		if (effective.source === 'billing_disabled' || snapshot?.source === 'billing_disabled') {
			return {
				title: 'Billing is disabled in this environment.',
				description: 'This organization is using the billing-disabled fallback, so Stripe recovery actions are hidden.',
				statusLabel: 'Billing Disabled',
				variant: 'secondary',
				actionHint: 'No billing action is available while billing is disabled.'
			};
		}

		if (effective.source === 'gift') {
			return {
				title: 'Gifted access is active.',
				description: 'An admin gift is currently granting this organization access outside Stripe billing.',
				statusLabel: 'Gifted',
				variant: 'success',
				actionHint: 'No payment recovery is needed while gifted access is active.'
			};
		}

		switch (snapshot?.subscriptionStatus) {
			case 'active':
				return {
					title: 'Subscription active.',
					description: 'Stripe reports this subscription as active and TroopToTask is applying the paid plan.',
					statusLabel: 'Active',
					variant: 'success',
					actionHint: 'Use Manage Subscription for invoices, payment methods, and portal self-service.'
				};
			case 'trialing':
				return {
					title: 'Trial active.',
					description: `Stripe reports this subscription is trialing${
						snapshot.trialEnd ? ` until ${formatBillingDate(snapshot.trialEnd)}` : ''
					}.`,
					statusLabel: 'Trialing',
					variant: 'success',
					actionHint: 'Use Manage Subscription to review payment details before the trial ends.'
				};
			case 'past_due':
				return {
					title:
						effective.tier === 'free'
							? 'Payment failed. Paid access has been suspended.'
							: 'Payment failed. Grace access is active.',
					description:
						effective.tier === 'free'
							? 'Stripe reports a past-due subscription. Access has been downgraded to the free plan until billing is restored.'
							: 'Stripe reports a past-due subscription. Paid access may be read-only until the payment method is updated.',
					statusLabel: 'Past Due',
					variant: 'warning',
					actionHint: 'Open the billing portal to update the payment method and recover full access.'
				};
			case 'unpaid':
				return {
					title: 'Payment required to restore paid access.',
					description:
						effective.tier === 'free'
							? 'Stripe reports this subscription as unpaid, so this organization is on the free plan until billing is restored.'
							: 'Stripe reports this subscription as unpaid, so TroopToTask is blocking paid writes.',
					statusLabel: 'Unpaid',
					variant: 'destructive',
					actionHint: 'Use the billing portal or choose a plan below to recover service.'
				};
			case 'canceled':
				return {
					title: 'Subscription canceled.',
					description:
						'Stripe reports this subscription as canceled, so paid access has ended unless another source applies.',
					statusLabel: 'Canceled',
					variant: 'warning',
					actionHint: 'Choose a plan below to start a new checkout, or use the portal if Stripe still allows recovery.'
				};
			case 'incomplete':
				return {
					title: 'Payment is pending.',
					description:
						'Stripe has not finished activating this subscription. Complete checkout to activate paid access.',
					statusLabel: 'Payment Pending',
					variant: 'warning',
					actionHint: 'Return to checkout or manage billing if a portal session is available.'
				};
			case 'incomplete_expired':
				return {
					title: 'Checkout expired.',
					description: 'The pending Stripe checkout expired before payment completed.',
					statusLabel: 'Checkout Expired',
					variant: 'warning',
					actionHint: 'Choose a plan below to start a new checkout.'
				};
			case 'paused':
				return {
					title: 'Subscription paused.',
					description: 'Stripe reports this subscription is paused. Current policy keeps paid access available.',
					statusLabel: 'Paused',
					variant: 'warning',
					actionHint: 'Open the billing portal to resume or update the subscription.'
				};
			default:
				return {
					title: 'Free plan active.',
					description: 'No active Stripe subscription is currently applied to this organization.',
					statusLabel: 'Free',
					variant: 'secondary',
					actionHint: 'Choose a paid plan below to activate more capacity.'
				};
		}
	}

	function sourceVariant(src: string): BadgeVariant {
		switch (src) {
			case 'subscription':
				return 'warning';
			case 'gift':
				return 'success';
			default:
				return 'secondary';
		}
	}

	function billingAlertVariant(variant: BadgeVariant): 'default' | 'destructive' | 'warning' {
		if (variant === 'destructive') return 'destructive';
		if (variant === 'warning') return 'warning';
		return 'default';
	}

	function usageStatusLabel(status: string): string {
		switch (status) {
			case 'over_limit':
				return 'Over limit';
			case 'limit_reached':
				return 'Limit reached';
			case 'read_only':
				return 'Read-only';
			default:
				return 'Within limit';
		}
	}

	function usageStatusVariant(status: string): BadgeVariant {
		if (status === 'over_limit') return 'destructive';
		if (status === 'limit_reached' || status === 'read_only') return 'warning';
		return 'secondary';
	}

	function downgradePreviewForTier(tierName: Tier) {
		return downgradePreviews.find((preview) => preview.targetPlan.tier === tierName) ?? null;
	}

	function readOnlyTitle(): string {
		if (readOnlyReason === 'payment_failure') return 'Payment failed. Your organization is in grace mode.';
		if (readOnlyReason === 'billing_state') return 'Subscription access needs attention.';
		return 'Your organization is in read-only mode.';
	}

	function readOnlyDescription(): string {
		if (readOnlyReason === 'payment_failure') {
			return 'A renewal payment failed, so paid access is temporarily read-only. Update the payment method in the billing portal to restore full access.';
		}

		if (readOnlyReason === 'billing_state') {
			return 'The subscription is not currently active. Existing organization data is preserved, but paid writes are blocked until billing is restored.';
		}

		return `You have ${personnelCount} personnel but your plan allows ${
			personnelCap === Infinity ? 'unlimited' : personnelCap
		}. Subscribe to a higher tier, contact support for enterprise access, or remove personnel to restore full access.`;
	}

	function formatBillingDate(value: string | null | undefined): string {
		if (!value) return 'Not available';
		return new Date(value).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

	function openConfirmPasswordDialog(action: PendingBillingAction) {
		pendingBillingAction = action;
		confirmPassword = '';
		confirmPasswordError = '';
		confirmPasswordOpen = true;
	}

	function closeConfirmPasswordDialog() {
		if (confirmPasswordLoading) return;
		confirmPasswordOpen = false;
		pendingBillingAction = null;
		confirmPassword = '';
		confirmPasswordError = '';
	}

	function handleBillingApiFailure(
		result: BillingApiResult,
		fallbackMessage: string,
		action: PendingBillingAction
	): boolean {
		if (result.requiresStepUp) {
			if (action.kind === 'subscribe') subscribingTier = null;
			if (action.kind === 'portal') portalLoading = false;
			if (action.kind === 'cancel') cancelLoading = false;
			if (!result.stepUpPath || result.stepUpPath === '/auth/login') {
				openConfirmPasswordDialog(action);
				return true;
			}

			redirectToSensitiveActionStepUp(result);
			return true;
		}

		errorMessage = result.error || fallbackMessage;
		return false;
	}

	async function retryPendingBillingAction() {
		const action = pendingBillingAction;
		pendingBillingAction = null;

		if (!action) return;
		if (action.kind === 'subscribe') {
			await handleSubscribe(action.tier);
			return;
		}
		if (action.kind === 'portal') {
			await handleManageSubscription();
			return;
		}
		await submitCancelSubscription();
	}

	async function handleConfirmPassword(event: SubmitEvent) {
		event.preventDefault();
		if (confirmPasswordLoading) return;
		confirmPasswordError = '';

		if (!confirmPassword) {
			confirmPasswordError = 'Enter your password to continue.';
			return;
		}

		confirmPasswordLoading = true;
		try {
			const res = await fetch('/api/auth/confirm-sensitive-action', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: confirmPassword })
			});
			const result = (await res.json()) as ConfirmSensitiveActionResult;

			if (result.requiresStepUp) {
				redirectToSensitiveActionStepUp(result);
				return;
			}

			if (!res.ok) {
				confirmPasswordError = result.error || 'Password confirmation failed. Try again.';
				return;
			}

			confirmPasswordOpen = false;
			confirmPassword = '';
			await retryPendingBillingAction();
		} catch {
			confirmPasswordError = 'An unexpected error occurred. Please try again.';
		} finally {
			confirmPasswordLoading = false;
		}
	}

	async function handleSubscribe(selectedTier: string) {
		if (subscribingTier) return;
		subscribingTier = selectedTier;
		errorMessage = '';

		try {
			const res = await fetch(`/org/${data.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: selectedTier })
			});

			const result = (await res.json()) as BillingApiResult;
			if (!res.ok) {
				if (
					handleBillingApiFailure(result, 'Failed to create checkout session', {
						kind: 'subscribe',
						tier: selectedTier
					})
				)
					return;
				subscribingTier = null;
				return;
			}

			if (!result.url) {
				errorMessage = 'Checkout did not return a redirect URL. Please try again.';
				subscribingTier = null;
				return;
			}

			window.location.href = result.url;
			// Don't reset subscribingTier — keep button disabled until navigation completes
		} catch {
			errorMessage = 'An unexpected error occurred. Please try again.';
			subscribingTier = null;
		}
	}

	async function handleCancelSubscription() {
		if (cancelLoading) return;
		if (
			!confirm(
				'Are you sure you want to cancel your subscription immediately? Your organization will revert to the Free tier.'
			)
		) {
			return;
		}
		cancelLoading = true;
		errorMessage = '';

		await submitCancelSubscription();
	}

	async function submitCancelSubscription() {
		cancelLoading = true;
		errorMessage = '';
		try {
			const res = await fetch(`/org/${data.orgId}/billing/cancel`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			const result = (await res.json()) as BillingApiResult;
			if (!res.ok) {
				if (handleBillingApiFailure(result, 'Failed to cancel subscription', { kind: 'cancel' })) return;
				return;
			}

			await invalidateAll();
		} catch {
			errorMessage = 'An unexpected error occurred. Please try again.';
		} finally {
			cancelLoading = false;
		}
	}

	async function handleManageSubscription() {
		if (portalLoading) return;
		portalLoading = true;
		errorMessage = '';

		try {
			const res = await fetch(`/org/${data.orgId}/billing/portal`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			const result = (await res.json()) as BillingApiResult;
			if (!res.ok) {
				if (handleBillingApiFailure(result, 'Failed to open subscription portal', { kind: 'portal' })) return;
				return;
			}

			if (!result.url) {
				errorMessage = 'Billing portal did not return a redirect URL. Please try again.';
				return;
			}

			window.location.href = result.url;
		} catch {
			errorMessage = 'An unexpected error occurred. Please try again.';
		} finally {
			portalLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Billing - {data.orgName} - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide">
	<PageShell.Header
		title="Billing"
		subtitle="Manage subscription status, plan limits, and Stripe billing for this organization."
	>
		{#snippet meta()}
			<Badge variant={sourceVariant(source)}>{sourceLabel(source)}</Badge>
		{/snippet}
	</PageShell.Header>

	{#if billingToolbarActions.length > 0}
		<WorkspaceToolbar.Root ariaLabel="Billing controls">
			<WorkspaceToolbar.Group label="Billing actions" zone="actions">
				<WorkspaceToolbar.Actions
					actions={billingToolbarActions}
					ariaLabel="Billing actions"
					overflowAriaLabel="More billing actions"
				/>
			</WorkspaceToolbar.Group>
		</WorkspaceToolbar.Root>
	{/if}

	{#if isReadOnly}
		<Alert.Root variant="warning">
			<TriangleAlert />
			<Alert.Title>{readOnlyTitle()}</Alert.Title>
			<Alert.Description>{readOnlyDescription()}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if errorMessage}
		<Alert.Root variant="destructive">
			<Alert.Description>{errorMessage}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if showCancellationTiming && cancellationSummary?.state === 'canceling_at_period_end'}
		<Alert.Root variant="warning">
			<TriangleAlert />
			<Alert.Title>Your subscription is scheduled to cancel.</Alert.Title>
			<Alert.Description>
				Paid access remains active through {formatBillingDate(cancellationSummary.currentPeriodEnd)}. You can manage or
				resume the subscription from the billing portal before that date.
			</Alert.Description>
		</Alert.Root>
	{:else if showCancellationTiming && cancellationSummary?.state === 'canceled'}
		<Alert.Root variant="warning">
			<TriangleAlert />
			<Alert.Title>Your subscription has been canceled.</Alert.Title>
			<Alert.Description>
				Access ended on {formatBillingDate(cancellationSummary.canceledAt ?? cancellationSummary.currentPeriodEnd)}.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<PageShell.FactGrid layout="three">
		<PageShell.Metric
			label="Current Plan"
			value={tierComparison.find((t) => t.tier === tier.tier)?.name ?? tier.tier}
			detail={isReadOnly ? 'Organization access is limited right now' : 'Organization access is active and available'}
			tone={isReadOnly ? 'warning' : 'default'}
		/>
		<PageShell.Metric
			label="Personnel Usage"
			value={`${personnelCount} / ${personnelCap === Infinity ? 'Unlimited' : personnelCap}`}
			detail="Current headcount against the plan limit"
		/>
		<PageShell.Metric
			label="Plan Source"
			value={sourceLabel(source)}
			detail={source === 'gift'
				? 'Access is currently being granted outside Stripe billing'
				: 'How this subscription is currently being applied'}
		/>
	</PageShell.FactGrid>

	{#if planUsageSummary}
		<Card.Root>
			<Card.Header>
				<div class="flex flex-wrap items-center gap-2">
					<Card.Title>Usage & Limits</Card.Title>
					<Badge variant="outline">{planUsageSummary.plan.sourceLabel}</Badge>
				</div>
				<Card.Description>
					Plan-backed usage for the current billing period. Existing data remains visible if a limit is reached.
				</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					{#each planUsageSummary.rows as row (row.dimension)}
						<div class="grid gap-2 rounded-md border bg-muted/30 p-3">
							<div class="flex items-start justify-between gap-2">
								<p class="text-sm font-medium">{row.label}</p>
								<Badge variant={usageStatusVariant(row.status)}>{usageStatusLabel(row.status)}</Badge>
							</div>
							<strong class="text-xl font-semibold tracking-tight">
								{row.used} / {row.limitLabel}
							</strong>
							<p class="text-xs text-muted-foreground">{row.message}</p>
							{#if row.status !== 'within_limit'}
								<p class="text-xs font-medium">{row.remediation}</p>
							{/if}
						</div>
					{/each}
				</div>
				{#if planUsageSummary.alerts.length > 0}
					<Alert.Root variant="warning">
						<TriangleAlert />
						<Alert.Title>Existing data remains visible. Resolve limits before adding more data.</Alert.Title>
						<Alert.Description>
							<ul class="grid gap-1">
								{#each planUsageSummary.alerts as alert (`${alert.dimension}-${alert.status}`)}
									<li>{alert.label}: {alert.remediation}</li>
								{/each}
							</ul>
						</Alert.Description>
					</Alert.Root>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<div class="flex flex-wrap items-center gap-2">
				<Card.Title>Billing Status</Card.Title>
				<Badge variant={billingStatus.variant}>{billingStatus.statusLabel}</Badge>
			</div>
			<Card.Description>{billingStatus.description}</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4">
			<Alert.Root variant={billingAlertVariant(billingStatus.variant)}>
				<Alert.Title>{billingStatus.title}</Alert.Title>
				<Alert.Description>{billingStatus.actionHint}</Alert.Description>
			</Alert.Root>
			<PageShell.FactGrid layout="three">
				<PageShell.FactRow
					label="Subscription Status"
					value={subscriptionStatusLabel(billingSnapshot?.subscriptionStatus)}
					layout="stack"
				/>
				<PageShell.FactRow
					label="Entitlement Source"
					value={snapshotSourceLabel(billingSnapshot?.source)}
					layout="stack"
				/>
				<PageShell.FactRow
					label="Paid Through"
					value={formatBillingDate(billingSnapshot?.currentPeriodEnd)}
					layout="stack"
				/>
				<PageShell.FactRow label="Sync Health" value={syncHealthLabel(billingSnapshot)} layout="stack" />
			</PageShell.FactGrid>
			{#if data.canManageSubscription && !billingActionsDisabled}
				<div>
					<Button variant="outline" onclick={handleManageSubscription} disabled={portalLoading}>
						{#if portalLoading}<Spinner />{/if}
						{portalLoading ? 'Opening...' : 'Manage Subscription'}
					</Button>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if showCancellationTiming}
		<Card.Root>
			<Card.Header>
				<Card.Title>Cancellation Timing</Card.Title>
				<Card.Description>{cancellationSummary.description}</Card.Description>
			</Card.Header>
			<Card.Content>
				<PageShell.FactGrid layout="three">
					<PageShell.FactRow label="Status" value={cancellationSummary.label} layout="stack" />
					<PageShell.FactRow
						label="Paid Through"
						value={formatBillingDate(cancellationSummary.currentPeriodEnd)}
						layout="stack"
					/>
					<PageShell.FactRow
						label="Canceled At"
						value={formatBillingDate(cancellationSummary.canceledAt)}
						layout="stack"
					/>
				</PageShell.FactGrid>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<div class="flex flex-wrap items-center gap-2">
				<Card.Title>Current Plan</Card.Title>
				<Badge variant={sourceVariant(source)}>{sourceLabel(source)}</Badge>
			</div>
			<Card.Description>
				{tierComparison.find((t) => t.tier === tier.tier)?.name ?? tier.tier}
			</Card.Description>
		</Card.Header>

		{#if source === 'gift' && giftExpiresAt}
			<Card.Content>
				<Alert.Root variant="success">
					<Gift />
					<Alert.Title>
						Complimentary {giftTier ? giftTier.charAt(0).toUpperCase() + giftTier.slice(1) : ''} tier
					</Alert.Title>
					<Alert.Description>
						Expires: {new Date(giftExpiresAt).toLocaleDateString('en-US', {
							year: 'numeric',
							month: 'long',
							day: 'numeric'
						})}
						{#if giftDaysRemaining !== null}
							({giftDaysRemaining} {giftDaysRemaining === 1 ? 'day' : 'days'} remaining)
						{/if}
					</Alert.Description>
				</Alert.Root>
			</Card.Content>
		{/if}
	</Card.Root>

	<section class="grid gap-3" aria-labelledby="billing-pricing-heading">
		<div class="grid gap-1">
			<h2 id="billing-pricing-heading" class="text-xl font-semibold tracking-tight">Plans & Pricing</h2>
			<p class="text-sm text-muted-foreground">Choose the plan that matches your organization size and export needs.</p>
		</div>

		<div class="grid gap-3 lg:grid-cols-3">
			{#each tierComparison as plan (plan.tier)}
				{@const isCurrent = plan.tier === tier.tier}
				{@const downgradePreview = downgradePreviewForTier(plan.tier)}
				{@const isDowngrade = downgradePreview !== null}
				<Card.Root class="flex flex-col">
					<Card.Header>
						<div class="flex flex-wrap items-start justify-between gap-2">
							<div class="grid gap-1">
								<Card.Title>{plan.name}</Card.Title>
								<Card.Description>{formatPrice(plan.priceMonthly)}</Card.Description>
							</div>
							{#if isCurrent}
								<Badge variant="warning">Current</Badge>
							{/if}
						</div>
					</Card.Header>

					<Card.Content class="flex flex-1 flex-col gap-4">
						<ul class="grid gap-3 text-sm text-muted-foreground">
							<li class="flex gap-2">
								<Check class="mt-0.5 size-4 shrink-0 text-success-foreground" />
								<span><strong>{formatCap(plan.personnelCap)}</strong> personnel</span>
							</li>
							<li class="flex gap-2">
								<Check class="mt-0.5 size-4 shrink-0 text-success-foreground" />
								<span>
									<strong>{formatCap(plan.maxOrgsOwned)}</strong>
									{plan.maxOrgsOwned === 1 ? 'organization' : 'organizations'}
								</span>
							</li>
							<li class="flex gap-2">
								<Check class="mt-0.5 size-4 shrink-0 text-success-foreground" />
								<span><strong>{formatCap(plan.bulkExportsPerMonth)}</strong> exports/month</span>
							</li>
						</ul>

						{#if downgradePreview}
							<div class="grid gap-3 rounded-md border bg-muted/30 p-3">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<p class="text-sm font-medium">Downgrade preview</p>
									<Badge variant={downgradePreview.status === 'blocked' ? 'warning' : 'success'}>
										{downgradePreview.status === 'blocked' ? 'Needs remediation' : 'Within limits'}
									</Badge>
								</div>
								<p class="text-xs text-muted-foreground">{downgradePreview.preservesExistingDataMessage}</p>
								{#if downgradePreview.blockers.length > 0}
									<ul class="grid gap-2 text-xs">
										{#each downgradePreview.blockers as blocker (`${plan.tier}-${blocker.label}`)}
											<li>
												<span class="font-medium">{blocker.label}:</span>
												{blocker.message}
												<span class="font-medium">{blocker.remediation}</span>
											</li>
										{/each}
									</ul>
								{:else}
									<p class="text-xs font-medium">Current usage is within this plan's limits.</p>
								{/if}
							</div>
						{/if}
					</Card.Content>

					<Card.Footer>
						{#if billingActionsDisabled}
							<Button class="w-full" variant="outline" disabled>Billing Disabled</Button>
						{:else if isCurrent}
							<Button class="w-full" variant="outline" disabled>Current Plan</Button>
						{:else if plan.tier === 'free'}
							{#if isDowngrade && data.canManageSubscription}
								<Button class="w-full" variant="outline" onclick={handleManageSubscription} disabled={portalLoading}>
									{#if portalLoading}<Spinner />{/if}
									{portalLoading ? 'Opening...' : 'Manage Subscription'}
								</Button>
							{:else}
								<Button class="w-full" variant="outline" disabled>Free Plan</Button>
							{/if}
						{:else if isDowngrade && data.canManageSubscription}
							<Button class="w-full" variant="outline" onclick={handleManageSubscription} disabled={portalLoading}>
								{#if portalLoading}<Spinner />{/if}
								{portalLoading ? 'Opening...' : 'Downgrade'}
							</Button>
						{:else}
							<Button class="w-full" onclick={() => handleSubscribe(plan.tier)} disabled={!!subscribingTier}>
								{#if subscribingTier === plan.tier}<Spinner />{/if}
								{subscribingTier === plan.tier ? 'Redirecting...' : 'Subscribe'}
							</Button>
						{/if}
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>
	</section>

	<AppDialog.Root
		bind:open={confirmPasswordOpen}
		closeBlocked={confirmPasswordLoading}
		onClose={closeConfirmPasswordDialog}
	>
		<AppDialog.Content closeBlocked={confirmPasswordLoading}>
			<AppDialog.Header>
				<AppDialog.Title>Confirm your password</AppDialog.Title>
				<AppDialog.Description>Enter your password again to continue with this billing action.</AppDialog.Description>
			</AppDialog.Header>

			<form onsubmit={handleConfirmPassword}>
				<AppDialog.Body class="grid gap-4">
					{#if confirmPasswordError}
						<Alert.Root variant="destructive">
							<Alert.Description>{confirmPasswordError}</Alert.Description>
						</Alert.Root>
					{/if}

					<div class="grid gap-2">
						<Label for="billing-confirm-password">Password</Label>
						<Input
							id="billing-confirm-password"
							type="password"
							bind:value={confirmPassword}
							autocomplete="current-password"
							disabled={confirmPasswordLoading}
							required
						/>
					</div>
				</AppDialog.Body>

				<AppDialog.Footer>
					<Button
						type="button"
						variant="outline"
						onclick={closeConfirmPasswordDialog}
						disabled={confirmPasswordLoading}
					>
						Cancel
					</Button>
					<Button type="submit" disabled={confirmPasswordLoading}>
						{#if confirmPasswordLoading}<Spinner />{/if}
						{confirmPasswordLoading ? 'Confirming...' : 'Continue'}
					</Button>
				</AppDialog.Footer>
			</form>
		</AppDialog.Content>
	</AppDialog.Root>
</PageShell.Root>
