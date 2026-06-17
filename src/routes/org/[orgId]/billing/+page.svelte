<script lang="ts">
	import {
		Archive,
		ArrowUpCircle,
		Check,
		CreditCard,
		ExternalLink,
		Gift,
		LifeBuoy,
		TriangleAlert,
		X,
		UserMinus
	} from '@lucide/svelte';
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
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { redirectToSensitiveActionStepUp } from '$lib/auth/sensitiveActionStepUp';
	import type { BillingSnapshot, BillingCancellationFeedback, EffectiveTier, Tier } from '$lib/types/subscription';

	type BillingApiResult = {
		success?: boolean;
		url?: string;
		error?: string;
		requiresStepUp?: boolean;
		stepUpPath?: string | null;
	};

	type PendingCheckoutSession = {
		id: string;
		tier: 'team' | 'unit';
		checkoutUrl: string | null;
		expiresAt: string | null;
		createdAt: string;
	};

	type PendingBillingAction =
		| { kind: 'subscribe'; tier: string }
		| { kind: 'portal' }
		| { kind: 'cancel'; feedback: BillingCancellationFeedback | null };

	type ConfirmSensitiveActionResult = {
		success?: boolean;
		error?: string;
		requiresStepUp?: boolean;
		stepUpPath?: string | null;
	};

	type UsageAlertAction = {
		id: string;
		label: string;
		href: string;
		icon: 'archive' | 'members' | 'plans' | 'support';
	};

	let { data }: { data: PageData } = $props();

	let subscribingTier = $state<string | null>(null);
	let portalLoading = $state(false);
	let cancelLoading = $state(false);
	let cancelCheckoutLoading = $state(false);
	let errorMessage = $state('');
	let confirmPasswordOpen = $state(false);
	let confirmPassword = $state('');
	let confirmPasswordError = $state('');
	let confirmPasswordLoading = $state(false);
	let pendingBillingAction = $state<PendingBillingAction | null>(null);
	let cancelNowDialogOpen = $state(false);
	let cancelNowConfirmation = $state('');
	let cancelFeedback = $state<'none' | BillingCancellationFeedback>('none');
	let cancelNowError = $state('');
	let subscribeConfirmOpen = $state(false);
	let subscribeConfirmTier = $state<string | null>(null);
	const orgUrlSegment = $derived(data.shell.org.urlSegment);

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
	const pendingCheckoutSession = $derived<PendingCheckoutSession | null>(data.pendingCheckoutSession ?? null);
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
	const hasPaidBillingSnapshot = $derived(isPaidBillingSnapshot(billingSnapshot));
	const hasManageablePaidBillingSnapshot = $derived(
		hasPaidBillingSnapshot &&
			billingSnapshot?.subscriptionStatus !== 'canceled' &&
			billingSnapshot?.subscriptionStatus !== 'incomplete_expired'
	);
	const hasRetainedBillingCustomer = $derived(!!(billingSnapshot?.stripeCustomerId || data.stripeCustomerId));
	const isActiveFreeBillingState = $derived(isActiveFreeBillingSnapshot(billingSnapshot));
	const canOpenBillingPortal = $derived(
		data.canManageSubscription && !billingActionsDisabled && hasRetainedBillingCustomer && !isActiveFreeBillingState
	);
	const canManagePaidPlanChange = $derived(
		canOpenBillingPortal && source !== 'gift' && hasManageablePaidBillingSnapshot
	);
	const canShowCancellationControls = $derived(
		canOpenBillingPortal && source !== 'gift' && hasManageablePaidBillingSnapshot
	);
	const billingRecovery = $derived(
		buildBillingRecovery(billingSnapshot, tier, canOpenBillingPortal, billingActionsDisabled)
	);
	const usageAlertTitle = $derived(buildUsageAlertTitle(planUsageSummary?.alerts ?? []));
	const usageAlertActions = $derived.by(() => buildUsageAlertActions(planUsageSummary?.alerts ?? [], orgUrlSegment));
	const canShowImmediateCancellation = $derived(
		data.canManageSubscription &&
			!billingActionsDisabled &&
			source !== 'gift' &&
			hasManageablePaidBillingSnapshot &&
			!!billingSnapshot?.stripeSubscriptionId
	);
	const selectedCancellationFeedback = $derived<BillingCancellationFeedback | null>(
		cancelFeedback === 'none' ? null : cancelFeedback
	);
	const subscribeConfirmPlan = $derived(
		subscribeConfirmTier ? tierComparison.find((t) => t.tier === subscribeConfirmTier) : null
	);
	const cancellationFeedbackOptions: Array<{ value: 'none' | BillingCancellationFeedback; label: string }> = [
		{ value: 'none', label: 'No reason selected' },
		{ value: 'too_expensive', label: 'Too expensive' },
		{ value: 'unused', label: 'Not using it enough' },
		{ value: 'missing_features', label: 'Missing features' },
		{ value: 'too_complex', label: 'Too complex' },
		{ value: 'customer_service', label: 'Customer service' },
		{ value: 'low_quality', label: 'Quality did not meet needs' },
		{ value: 'switched_service', label: 'Switched service' },
		{ value: 'other', label: 'Other' }
	];

	const giftDaysRemaining = $derived.by(() => {
		if (!giftExpiresAt) return null;
		const diff = new Date(giftExpiresAt).getTime() - Date.now();
		return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
	});
	function formatPrice(cents: number): string {
		if (cents === 0) return 'Free';
		return `$${(cents / 100).toFixed(2)}/mo`;
	}

	function formatCap(cap: number | null): string {
		return cap === null ? 'Unlimited' : String(cap);
	}

	function sourceLabel(src: string): string {
		switch (src) {
			case 'subscription':
				return 'Paid Subscription';
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

	function isPaidBillingSnapshot(snapshot: BillingSnapshot | null): boolean {
		return snapshot?.commercialPlan === 'team' || snapshot?.commercialPlan === 'unit';
	}

	function isActiveFreeBillingSnapshot(snapshot: BillingSnapshot | null): boolean {
		return (
			snapshot?.commercialPlan === 'free' && (snapshot.subscriptionStatus === 'active' || !snapshot.subscriptionStatus)
		);
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
				description: 'Billing actions are hidden because paid billing is turned off for this environment.',
				statusLabel: 'Billing Disabled',
				variant: 'secondary',
				actionHint: 'No billing action is available while billing is disabled.'
			};
		}

		if (effective.source === 'gift') {
			return {
				title: 'Gifted access is active.',
				description: 'An admin gift is currently granting this organization access outside regular billing.',
				statusLabel: 'Gifted',
				variant: 'success',
				actionHint: 'No payment recovery is needed while gifted access is active.'
			};
		}

		if (isActiveFreeBillingSnapshot(snapshot)) {
			return {
				title: 'Free plan active.',
				description: 'No active paid subscription is currently applied to this organization.',
				statusLabel: 'Free',
				variant: 'secondary',
				actionHint: 'Choose a paid plan below to activate more capacity.'
			};
		}

		switch (snapshot?.subscriptionStatus) {
			case 'active':
				return {
					title: 'Subscription active.',
					description: 'The paid subscription is active and TroopToTask is applying the paid plan.',
					statusLabel: 'Active',
					variant: 'success',
					actionHint: 'Use Manage Subscription for invoices, receipts, payment methods, and billing self-service.'
				};
			case 'trialing':
				return {
					title: 'Trial active.',
					description: `The subscription trial is active${
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
							? 'The renewal payment did not go through. Access has been downgraded to the free plan until billing is restored.'
							: 'The renewal payment did not go through. Paid access may be read-only until the payment method is updated.',
					statusLabel: 'Past Due',
					variant: 'warning',
					actionHint: 'Open the billing portal to update the payment method and recover full access.'
				};
			case 'unpaid':
				return {
					title: 'Payment required to restore paid access.',
					description:
						effective.tier === 'free'
							? 'The subscription is unpaid, so this organization is on the free plan until billing is restored.'
							: 'The subscription is unpaid, so TroopToTask is blocking paid writes.',
					statusLabel: 'Unpaid',
					variant: 'destructive',
					actionHint: 'Use the billing portal or choose a plan below to recover service.'
				};
			case 'canceled':
				return {
					title: 'Subscription canceled.',
					description: 'This subscription is canceled, so paid access has ended unless another access source applies.',
					statusLabel: 'Canceled',
					variant: 'warning',
					actionHint:
						'Choose a plan below to start a new checkout, or use the billing portal if recovery is still available.'
				};
			case 'incomplete':
				return {
					title: 'Payment is pending.',
					description:
						'Checkout has not finished activating this subscription. Complete checkout to activate paid access.',
					statusLabel: 'Payment Pending',
					variant: 'warning',
					actionHint: 'Return to checkout or manage billing if a portal session is available.'
				};
			case 'incomplete_expired':
				return {
					title: 'Checkout expired.',
					description: 'The pending checkout expired before payment completed.',
					statusLabel: 'Checkout Expired',
					variant: 'warning',
					actionHint: 'Choose a plan below to start a new checkout.'
				};
			case 'paused':
				return {
					title: 'Subscription paused.',
					description: 'This subscription is paused. Current policy keeps paid access available.',
					statusLabel: 'Paused',
					variant: 'warning',
					actionHint: 'Open the billing portal to resume or update the subscription.'
				};
			default:
				return {
					title: 'Free plan active.',
					description: 'No active paid subscription is currently applied to this organization.',
					statusLabel: 'Free',
					variant: 'secondary',
					actionHint: 'Choose a paid plan below to activate more capacity.'
				};
		}
	}

	function buildBillingRecovery(
		snapshot: BillingSnapshot | null,
		effective: EffectiveTier,
		canOpenPortal: boolean,
		actionsDisabled: boolean
	): {
		title: string;
		description: string;
		impact: string;
		statusLabel: string;
		steps: string[];
		portalLabel: string | null;
		showPlansLink: boolean;
		variant: 'warning' | 'destructive';
	} | null {
		if (!snapshot || actionsDisabled || effective.source === 'gift') return null;

		switch (snapshot.subscriptionStatus) {
			case 'past_due':
				return {
					title: 'Payment recovery needed',
					description: 'Your renewal payment did not go through. Existing data remains visible while you fix billing.',
					impact:
						effective.tier === 'free'
							? 'Paid access is suspended and paid-plan writes are blocked until billing is restored.'
							: 'Grace access may be read-only; some paid-plan writes can be blocked until payment succeeds.',
					statusLabel: 'Past Due',
					steps: [
						'Update the payment method in the billing portal.',
						'Contact support if the payment is correct but access does not recover.'
					],
					portalLabel: canOpenPortal ? 'Update Payment Method' : null,
					showPlansLink: false,
					variant: 'warning'
				};
			case 'unpaid':
				return {
					title: 'Payment is required',
					description: 'The paid subscription is unpaid. Existing data remains visible on the account.',
					impact: 'Paid-plan writes are blocked until billing is restored or a new plan is selected.',
					statusLabel: 'Unpaid',
					steps: [
						'Open the billing portal to retry payment.',
						'Choose a plan below if the old subscription cannot be recovered.'
					],
					portalLabel: canOpenPortal ? 'Open Billing Portal' : null,
					showPlansLink: true,
					variant: 'destructive'
				};
			case 'canceled':
				return {
					title: 'Paid access ended',
					description: 'The paid subscription has ended. Existing organization data is still visible.',
					impact: 'New work follows Free plan limits until a paid plan is started again.',
					statusLabel: 'Canceled',
					steps: [
						'Choose Team or Unit below to restart paid access.',
						'Contact support if the cancellation was unexpected.'
					],
					portalLabel: null,
					showPlansLink: true,
					variant: 'warning'
				};
			case 'incomplete':
				return {
					title: 'Checkout still needs attention',
					description:
						'The checkout has not finished. Existing data remains visible, but the paid plan is not active yet.',
					impact: 'Paid capacity starts only after checkout completes.',
					statusLabel: 'Payment Pending',
					steps: [
						'Complete payment in the billing portal to activate the subscription.',
						'Open the billing portal if payment details need attention.'
					],
					portalLabel: canOpenPortal ? 'Review Billing Details' : null,
					showPlansLink: false,
					variant: 'warning'
				};
			case 'incomplete_expired':
				return {
					title: 'Checkout expired',
					description: 'The previous checkout expired before payment completed. No paid access was activated from it.',
					impact: 'Existing data remains visible; choose a paid plan below to start a fresh checkout.',
					statusLabel: 'Checkout Expired',
					steps: [
						'Choose Team or Unit below to start again.',
						'Contact support if checkout expired after a successful payment.'
					],
					portalLabel: null,
					showPlansLink: true,
					variant: 'warning'
				};
			default:
				return null;
		}
	}

	function buildUsageAlertActions(alerts: Array<{ dimension: string }>, orgId: string): UsageAlertAction[] {
		const dimensions = new Set(alerts.map((alert) => alert.dimension));
		const actions: UsageAlertAction[] = [];

		if (dimensions.has('active_personnel')) {
			actions.push({
				id: 'archive-personnel',
				label: 'Open Personnel',
				href: `/org/${orgId}/personnel`,
				icon: 'archive'
			});
		}

		if (dimensions.has('active_organization_members') || dimensions.has('pending_invitations')) {
			actions.push({
				id: 'manage-members',
				label: 'Manage Members',
				href: `/org/${orgId}/settings`,
				icon: 'members'
			});
		}

		if (
			dimensions.has('active_personnel') ||
			dimensions.has('active_organization_members') ||
			dimensions.has('pending_invitations') ||
			dimensions.has('monthly_exports')
		) {
			actions.push({
				id: 'compare-plans',
				label: 'Compare Plans',
				href: '#billing-pricing-heading',
				icon: 'plans'
			});
			actions.push({
				id: 'contact-support',
				label: 'Contact Support',
				href: 'mailto:support@trooptotask.com',
				icon: 'support'
			});
		}

		return actions;
	}

	function buildUsageAlertTitle(alerts: Array<{ dimension: string }>): string {
		const dimensions = new Set(alerts.map((alert) => alert.dimension));
		const hasBillingState = dimensions.has('billing_state');
		const hasUsageLimit = [...dimensions].some((dimension) => dimension !== 'billing_state');

		if (hasBillingState && hasUsageLimit) {
			return 'Existing data remains visible. Resolve billing or limits before adding more data.';
		}

		if (hasBillingState) {
			return 'Existing data remains visible. Resolve billing before adding more data.';
		}

		return 'Existing data remains visible. Resolve limits before adding more data.';
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

	function formatBillingDateTime(value: string | null | undefined): string {
		if (!value) return 'the provider expiration window ends';
		return new Date(value).toLocaleString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function planLabel(plan: Tier | string): string {
		return tierComparison.find((tierOption) => tierOption.tier === plan)?.name ?? plan;
	}

	function upgradeLabel(plan: { name: string }): string {
		return `Upgrade to ${plan.name}`;
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
			if (action.kind === 'cancel') {
				cancelLoading = false;
				cancelNowDialogOpen = false;
			}
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
		await submitCancelSubscription(action.feedback);
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

	function handleSubscribeClick(selectedTier: string) {
		subscribeConfirmTier = selectedTier;
		subscribeConfirmOpen = true;
	}

	function closeSubscribeConfirmDialog() {
		subscribeConfirmOpen = false;
		subscribeConfirmTier = null;
	}

	async function handleSubscribeConfirmed() {
		subscribeConfirmOpen = false;
		if (subscribeConfirmTier) {
			await handleSubscribe(subscribeConfirmTier);
		}
		subscribeConfirmTier = null;
	}

	async function handleSubscribe(selectedTier: string) {
		if (subscribingTier) return;
		if (pendingCheckoutSession) {
			if (pendingCheckoutSession.tier === selectedTier && pendingCheckoutSession.checkoutUrl) {
				window.location.href = pendingCheckoutSession.checkoutUrl;
				return;
			}
			errorMessage =
				'Cancel the pending checkout before starting another plan, or continue the open checkout from the notice above.';
			return;
		}
		subscribingTier = selectedTier;
		errorMessage = '';

		try {
			const res = await fetch(`/org/${orgUrlSegment}/billing/checkout`, {
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

	function handleContinuePendingCheckout() {
		if (!pendingCheckoutSession?.checkoutUrl) return;
		window.location.href = pendingCheckoutSession.checkoutUrl;
	}

	async function handleCancelPendingCheckout() {
		if (cancelCheckoutLoading) return;
		cancelCheckoutLoading = true;
		errorMessage = '';

		try {
			const res = await fetch(`/org/${orgUrlSegment}/billing/checkout/cancel`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			const result = (await res.json()) as BillingApiResult;
			if (!res.ok) {
				errorMessage = result.error || 'Failed to cancel pending checkout.';
				return;
			}

			await invalidateAll();
		} catch {
			errorMessage = 'An unexpected error occurred. Please try again.';
		} finally {
			cancelCheckoutLoading = false;
		}
	}

	function openCancelNowDialog() {
		if (cancelLoading) return;
		cancelNowConfirmation = '';
		cancelFeedback = 'none';
		cancelNowError = '';
		cancelNowDialogOpen = true;
	}

	function closeCancelNowDialog() {
		if (cancelLoading) return;
		cancelNowDialogOpen = false;
		cancelNowConfirmation = '';
		cancelFeedback = 'none';
		cancelNowError = '';
	}

	async function handleCancelSubscription() {
		if (cancelLoading) return;
		cancelNowError = '';
		if (cancelNowConfirmation.trim() !== 'CANCEL NOW') {
			cancelNowError = 'Type CANCEL NOW to confirm immediate cancellation.';
			return;
		}
		cancelLoading = true;
		errorMessage = '';

		await submitCancelSubscription(selectedCancellationFeedback);
	}

	async function submitCancelSubscription(feedback: BillingCancellationFeedback | null) {
		cancelLoading = true;
		errorMessage = '';
		try {
			const res = await fetch(`/org/${orgUrlSegment}/billing/cancel`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					confirmedImmediateCancellation: true,
					cancellationFeedback: feedback
				})
			});

			const result = (await res.json()) as BillingApiResult;
			if (!res.ok) {
				if (handleBillingApiFailure(result, 'Failed to cancel subscription', { kind: 'cancel', feedback })) return;
				return;
			}

			cancelNowDialogOpen = false;
			cancelNowConfirmation = '';
			cancelFeedback = 'none';
			cancelNowError = '';
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
			const res = await fetch(`/org/${orgUrlSegment}/billing/portal`, {
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
		subtitle="Manage plan limits, invoices, receipts, billing details, and explicit Team or Unit upgrades for this Organization."
	>
		{#snippet meta()}
			<Badge variant={sourceVariant(source)}>{sourceLabel(source)}</Badge>
		{/snippet}
	</PageShell.Header>

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

	{#if !billingActionsDisabled && pendingCheckoutSession}
		<Alert.Root variant="warning">
			<TriangleAlert />
			<Alert.Title>{planLabel(pendingCheckoutSession.tier)} checkout is already open.</Alert.Title>
			<Alert.Description>
				<p>
					This checkout expires on {formatBillingDateTime(pendingCheckoutSession.expiresAt)}. Continue it, or cancel it
					now before starting a different plan.
				</p>
				<div class="mt-3 flex flex-wrap gap-2">
					{#if pendingCheckoutSession.checkoutUrl}
						<Button type="button" variant="outline" onclick={handleContinuePendingCheckout}>
							<ExternalLink data-icon="inline-start" />
							Continue Checkout
						</Button>
					{/if}
					<Button
						type="button"
						variant="outline"
						onclick={handleCancelPendingCheckout}
						disabled={cancelCheckoutLoading}
					>
						<X data-icon="inline-start" />
						{#if cancelCheckoutLoading}<Spinner />{/if}
						{cancelCheckoutLoading ? 'Canceling...' : 'Cancel Pending Checkout'}
					</Button>
				</div>
			</Alert.Description>
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

	<Card.Root>
		<Card.Header>
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="grid gap-1.5">
					<div class="flex flex-wrap items-center gap-2">
						<Card.Title>Subscription</Card.Title>
						<Badge variant={billingStatus.variant}>{billingStatus.statusLabel}</Badge>
					</div>
					<Card.Description>{billingStatus.description}</Card.Description>
				</div>
				{#if canOpenBillingPortal}
					<Button type="button" class="shrink-0" onclick={handleManageSubscription} disabled={portalLoading}>
						{#if portalLoading}<Spinner />{/if}
						{portalLoading ? 'Opening...' : 'Manage Subscription'}
					</Button>
				{/if}
			</div>
		</Card.Header>
		<Card.Content class="grid gap-4">
			<PageShell.FactGrid layout="three">
				<PageShell.FactRow
					label="Status"
					value={billingStatus.statusLabel +
						' (' +
						(tierComparison.find((t) => t.tier === tier.tier)?.name ?? tier.tier) +
						(isReadOnly ? ' *Limited' : '') +
						')'}
					layout="stack"
				/>
				<PageShell.FactRow
					label="Paid Through"
					value={formatBillingDate(billingSnapshot?.currentPeriodEnd)}
					layout="stack"
				/>
				{#if showCancellationTiming && cancellationSummary}
					<PageShell.FactRow
						label="Canceled At"
						value={formatBillingDate(cancellationSummary.canceledAt)}
						layout="stack"
					/>
				{/if}
			</PageShell.FactGrid>

			{#if source === 'gift' && giftExpiresAt}
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
			{/if}

			{#if billingRecovery}
				<div class="grid gap-3 rounded-md border border-warning/20 bg-warning/5 p-4">
					<div class="flex flex-wrap items-center gap-2">
						<p class="text-sm font-semibold">{billingRecovery.title}</p>
						<Badge variant={billingRecovery.variant}>{billingRecovery.statusLabel}</Badge>
					</div>
					<p class="text-sm text-muted-foreground">{billingRecovery.description}</p>
					<p class="text-sm text-muted-foreground">{billingRecovery.impact}</p>
					<ol class="grid gap-1 pl-4 text-sm text-muted-foreground" style="list-style: decimal">
						{#each billingRecovery.steps as step (step)}
							<li>{step}</li>
						{/each}
					</ol>
					{#if billingRecovery.showPlansLink}
						<div>
							<Button href="#billing-pricing-heading" variant="outline" size="sm">View Plans</Button>
						</div>
					{/if}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

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
						<div class="grid gap-2 rounded-md bg-muted/40 p-3">
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
						<Alert.Title>{usageAlertTitle}</Alert.Title>
						<Alert.Description>
							<p class="mb-2">
								New personnel, member invitations, exports, or paid-plan writes can be blocked until these items are
								fixed.
							</p>
							<ul class="grid gap-1">
								{#each planUsageSummary.alerts as alert (`${alert.dimension}-${alert.status}`)}
									<li>{alert.label}: {alert.remediation}</li>
								{/each}
							</ul>
							{#if usageAlertActions.length > 0}
								<div class="mt-3 flex flex-wrap gap-2">
									{#each usageAlertActions as action (action.id)}
										<Button href={action.href} variant="outline" size="sm">
											{#if action.icon === 'archive'}
												<Archive data-icon="inline-start" />
											{:else if action.icon === 'members'}
												<UserMinus data-icon="inline-start" />
											{:else if action.icon === 'plans'}
												<ArrowUpCircle data-icon="inline-start" />
											{:else}
												<LifeBuoy data-icon="inline-start" />
											{/if}
											{action.label}
										</Button>
									{/each}
								</div>
							{/if}
						</Alert.Description>
					</Alert.Root>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	<section class="grid gap-3" aria-labelledby="billing-pricing-heading">
		<div class="grid gap-1">
			<h2 id="billing-pricing-heading" class="text-xl font-semibold tracking-tight">Plans & Pricing</h2>
			<p class="text-sm text-muted-foreground">
				New Organizations can stay on Free. Owners can explicitly upgrade to Team or Unit when they need more personnel
				capacity or exports.
			</p>
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
								<span><strong>{formatCap(plan.activeUserCap)}</strong> active users</span>
							</li>
							<li class="flex gap-2">
								<Check class="mt-0.5 size-4 shrink-0 text-success-foreground" />
								<span><strong>{formatCap(plan.bulkExportsPerMonth)}</strong> exports/month</span>
							</li>
						</ul>

						{#if downgradePreview}
							<div class="grid gap-3 rounded-md bg-muted/40 p-3">
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
						{:else if pendingCheckoutSession}
							{#if pendingCheckoutSession.tier === plan.tier && pendingCheckoutSession.checkoutUrl}
								<Button class="w-full" variant="outline" onclick={handleContinuePendingCheckout}>
									<ExternalLink data-icon="inline-start" />
									Continue Checkout
								</Button>
							{:else}
								<Button class="w-full" variant="outline" disabled>Pending Checkout</Button>
							{/if}
						{:else if isDowngrade && data.canManageSubscription}
							<Button class="w-full" variant="outline" onclick={handleManageSubscription} disabled={portalLoading}>
								{#if portalLoading}<Spinner />{/if}
								{portalLoading ? 'Opening...' : 'Downgrade'}
							</Button>
						{:else if canManagePaidPlanChange}
							<Button class="w-full" variant="outline" onclick={handleManageSubscription} disabled={portalLoading}>
								{#if portalLoading}<Spinner />{/if}
								{portalLoading ? 'Opening...' : 'Manage Subscription'}
							</Button>
						{:else}
							<Button class="w-full" onclick={() => handleSubscribeClick(plan.tier)} disabled={!!subscribingTier}>
								{#if subscribingTier === plan.tier}<Spinner />{/if}
								{subscribingTier === plan.tier ? 'Redirecting...' : upgradeLabel(plan)}
							</Button>
						{/if}
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>
	</section>

	{#if canShowCancellationControls}
		<Card.Root>
			<Card.Header>
				<Card.Title>Cancel Subscription</Card.Title>
				<Card.Description>Choose how to end your paid plan.</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="grid gap-2 rounded-md border p-4">
						<p class="text-sm font-semibold">Cancel at period end</p>
						<p class="text-sm text-muted-foreground">
							Keep paid access through {formatBillingDate(billingSnapshot?.currentPeriodEnd)}. No further charges after
							the current period.
						</p>
						<div class="mt-auto pt-2">
							<Button variant="outline" class="w-full" onclick={handleManageSubscription} disabled={portalLoading}>
								<CreditCard data-icon="inline-start" />
								{#if portalLoading}<Spinner />{/if}
								{portalLoading ? 'Opening...' : 'Cancel at Period End'}
							</Button>
						</div>
					</div>
					{#if canShowImmediateCancellation}
						<div class="grid gap-2 rounded-md border border-destructive/20 p-4">
							<p class="text-sm font-semibold">Cancel immediately</p>
							<p class="text-sm text-muted-foreground">
								End paid access now and move to the Free plan. Existing data stays visible.
							</p>
							<div class="mt-auto pt-2">
								<Button variant="destructive" class="w-full" onclick={openCancelNowDialog} disabled={cancelLoading}>
									{#if cancelLoading}<Spinner />{/if}
									{cancelLoading ? 'Canceling...' : 'Cancel Now'}
								</Button>
							</div>
						</div>
					{/if}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<AppDialog.Root bind:open={subscribeConfirmOpen} onClose={closeSubscribeConfirmDialog}>
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title>
					{subscribeConfirmPlan ? upgradeLabel(subscribeConfirmPlan) : 'Confirm upgrade'}
				</AppDialog.Title>
				<AppDialog.Description>Review the monthly plan before continuing to checkout.</AppDialog.Description>
			</AppDialog.Header>

			<AppDialog.Body class="grid gap-4">
				{#if subscribeConfirmPlan}
					<PageShell.FactGrid layout="three">
						<PageShell.FactRow label="Plan" value={subscribeConfirmPlan.name} layout="stack" />
						<PageShell.FactRow label="Price" value={formatPrice(subscribeConfirmPlan.priceMonthly)} layout="stack" />
						<PageShell.FactRow label="Billing" value="Monthly" layout="stack" />
					</PageShell.FactGrid>
				{/if}
				<p class="text-sm text-muted-foreground">
					You will be redirected to our payment provider to complete checkout. Your Organization remains on its current
					plan until checkout is complete.
				</p>
			</AppDialog.Body>

			<AppDialog.Footer>
				<Button type="button" variant="outline" onclick={closeSubscribeConfirmDialog}>Cancel</Button>
				<Button type="button" onclick={handleSubscribeConfirmed} disabled={!!subscribingTier}>
					{#if subscribingTier}<Spinner />{/if}
					{subscribingTier ? 'Redirecting...' : 'Continue to Checkout'}
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>

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

	<AppDialog.Root bind:open={cancelNowDialogOpen} closeBlocked={cancelLoading} onClose={closeCancelNowDialog}>
		<AppDialog.Content closeBlocked={cancelLoading}>
			<AppDialog.Header>
				<AppDialog.Title>Cancel paid access now</AppDialog.Title>
				<AppDialog.Description>
					This is the immediate cancellation path. Paid access ends now and the organization moves to the Free plan. Use
					the billing portal instead for period-end cancellation.
				</AppDialog.Description>
			</AppDialog.Header>

			<AppDialog.Body class="grid gap-4">
				{#if cancelNowError}
					<Alert.Root variant="destructive">
						<Alert.Description>{cancelNowError}</Alert.Description>
					</Alert.Root>
				{/if}

				<Alert.Root variant="warning">
					<TriangleAlert />
					<Alert.Title>Immediate cancellation ends paid access now.</Alert.Title>
					<Alert.Description>
						Existing data remains visible, but paid-plan writes may be blocked by Free plan limits after billing
						confirms the change.
					</Alert.Description>
				</Alert.Root>

				<div class="grid gap-2">
					<Label for="billing-cancel-feedback">Reason</Label>
					<Select.Root type="single" bind:value={cancelFeedback}>
						<Select.Trigger id="billing-cancel-feedback" class="w-full">
							{cancellationFeedbackOptions.find((option) => option.value === cancelFeedback)?.label ??
								'No reason selected'}
						</Select.Trigger>
						<Select.Content>
							{#each cancellationFeedbackOptions as option (option.value)}
								<Select.Item value={option.value} label={option.label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="grid gap-2">
					<Label for="billing-cancel-confirmation">Type CANCEL NOW to confirm</Label>
					<Input
						id="billing-cancel-confirmation"
						bind:value={cancelNowConfirmation}
						disabled={cancelLoading}
						autocomplete="off"
					/>
				</div>
			</AppDialog.Body>

			<AppDialog.Footer>
				<Button type="button" variant="outline" onclick={closeCancelNowDialog} disabled={cancelLoading}>
					Keep Subscription
				</Button>
				<Button
					type="button"
					variant="destructive"
					onclick={handleCancelSubscription}
					disabled={cancelLoading || cancelNowConfirmation.trim() !== 'CANCEL NOW'}
				>
					{#if cancelLoading}<Spinner />{/if}
					{cancelLoading ? 'Canceling...' : 'Cancel Now'}
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
</PageShell.Root>
