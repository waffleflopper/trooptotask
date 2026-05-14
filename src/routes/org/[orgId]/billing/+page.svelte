<script lang="ts">
	import { Check, Gift, TriangleAlert } from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as PageShell from '$lib/components/ui/page-shell';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
	import type { EffectiveTier, Tier } from '$lib/types/subscription';

	let { data } = $props();

	let subscribingTier = $state<string | null>(null);
	let portalLoading = $state(false);
	let cancelLoading = $state(false);
	let errorMessage = $state('');

	const fallbackTier: EffectiveTier = {
		tier: 'free',
		source: 'default',
		personnelCount: 0,
		personnelCap: 20,
		isReadOnly: false,
		giftExpiresAt: null,
		giftTier: null
	};

	const tier = $derived<EffectiveTier>(data.effectiveTier ?? fallbackTier);
	const tierComparison = $derived(data.tierComparison ?? []);
	const source = $derived(tier.source);
	const isReadOnly = $derived(tier.isReadOnly);
	const personnelCount = $derived(tier.personnelCount);
	const personnelCap = $derived(tier.personnelCap);
	const giftExpiresAt = $derived(tier.giftExpiresAt);
	const giftTier = $derived(tier.giftTier);

	const giftDaysRemaining = $derived.by(() => {
		if (!giftExpiresAt) return null;
		const diff = new Date(giftExpiresAt).getTime() - Date.now();
		return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
	});
	const billingToolbarActions = $derived.by(() => {
		if (!data.canManageSubscription) return [];

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

	function tierLabel(tierName: Tier): string {
		if (tierName === tier.tier) {
			if (source === 'gift') return 'Gifted';
			if (source === 'subscription') return 'Current Plan';
			return 'Current Plan';
		}
		const tierOrder: Tier[] = ['free', 'team', 'unit'];
		const currentIdx = tierOrder.indexOf(tier.tier);
		const targetIdx = tierOrder.indexOf(tierName);
		if (targetIdx < currentIdx) return 'Downgrade';
		return 'Subscribe';
	}

	function sourceLabel(src: string): string {
		switch (src) {
			case 'subscription':
				return 'Stripe Subscription';
			case 'gift':
				return 'Admin Gift';
			case 'default':
				return 'Free Plan';
			default:
				return src;
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

			const result = await res.json();
			if (!res.ok) {
				errorMessage = result.error || 'Failed to create checkout session';
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

		try {
			const res = await fetch(`/org/${data.orgId}/billing/cancel`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			const result = await res.json();
			if (!res.ok) {
				errorMessage = result.error || 'Failed to cancel subscription';
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

			const result = await res.json();
			if (!res.ok) {
				errorMessage = result.error || 'Failed to open subscription portal';
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
			<Alert.Title>Your organization is in read-only mode.</Alert.Title>
			<Alert.Description>
				You have <strong>{personnelCount}</strong> personnel but your plan allows
				<strong>{personnelCap === Infinity ? 'unlimited' : personnelCap}</strong>. Subscribe to a higher tier, contact
				support for enterprise access, or remove personnel to restore full access.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if errorMessage}
		<Alert.Root variant="destructive">
			<Alert.Description>{errorMessage}</Alert.Description>
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
				{@const label = tierLabel(plan.tier)}
				{@const isDowngrade = label === 'Downgrade'}
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
					</Card.Content>

					<Card.Footer>
						{#if isCurrent}
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
</PageShell.Root>
