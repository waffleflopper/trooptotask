import type {
	SubscriptionPlan,
	UserSubscription,
	SubscriptionLimits,
	BillingCycle
} from '../types/subscription';
import { isBillingEnabled } from '$lib/config/billing';

interface SubscriptionData {
	subscription: UserSubscription | null;
	plan: SubscriptionPlan | null;
	organizationCount: number;
}

class SubscriptionStore {
	#subscription = $state<UserSubscription | null>(null);
	#plan = $state<SubscriptionPlan | null>(null);
	#organizationCount = $state(0);
	#allPlans = $state<SubscriptionPlan[]>([]);

	// ============================================================
	// Getters
	// ============================================================

	get subscription() {
		return this.#subscription;
	}

	get plan() {
		return this.#plan;
	}

	get allPlans() {
		return this.#allPlans;
	}

	get organizationCount() {
		return this.#organizationCount;
	}

	// ============================================================
	// Computed Limits
	// ============================================================

	get limits(): SubscriptionLimits {
		// When billing is disabled, give unlimited access to all features
		if (!isBillingEnabled) {
			return {
				maxOrganizations: null, // unlimited
				currentOrganizations: this.#organizationCount,
				canCreateOrganization: true,
				maxPersonnelPerOrg: null, // unlimited
				hasDutyRoster: true,
				hasBulkImport: true,
				hasExcelExport: true,
				hasPrioritySupport: true,
				isActive: true,
				isPastDue: false,
				isTrialing: false,
				isCanceled: false,
				trialDaysRemaining: null,
				daysUntilRenewal: null
			};
		}

		const sub = this.#subscription;
		const plan = this.#plan;

		if (!sub || !plan) {
			// Default to free tier limits when no subscription loaded
			return {
				maxOrganizations: 1,
				currentOrganizations: this.#organizationCount,
				canCreateOrganization: this.#organizationCount < 1,
				maxPersonnelPerOrg: 25,
				hasDutyRoster: false,
				hasBulkImport: false,
				hasExcelExport: false,
				hasPrioritySupport: false,
				isActive: false,
				isPastDue: false,
				isTrialing: false,
				isCanceled: false,
				trialDaysRemaining: null,
				daysUntilRenewal: null
			};
		}

		// Check for admin overrides
		const now = new Date();
		const overrideActive = sub.overrideExpiry ? new Date(sub.overrideExpiry) > now : false;
		const maxOrgs = overrideActive && sub.overrideMaxOrgs !== null
			? sub.overrideMaxOrgs
			: plan.maxOrganizations;
		const maxPersonnel = overrideActive && sub.overrideMaxPersonnel !== null
			? sub.overrideMaxPersonnel
			: plan.maxPersonnelPerOrg;

		// Calculate trial days remaining
		let trialDaysRemaining: number | null = null;
		if (sub.status === 'trialing' && sub.trialEnd) {
			const trialEnd = new Date(sub.trialEnd);
			const diffMs = trialEnd.getTime() - now.getTime();
			trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
		}

		// Calculate days until renewal
		let daysUntilRenewal: number | null = null;
		if (sub.currentPeriodEnd && sub.status === 'active') {
			const periodEnd = new Date(sub.currentPeriodEnd);
			const diffMs = periodEnd.getTime() - now.getTime();
			daysUntilRenewal = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
		}

		return {
			maxOrganizations: maxOrgs,
			currentOrganizations: this.#organizationCount,
			canCreateOrganization: maxOrgs === null || this.#organizationCount < maxOrgs,
			maxPersonnelPerOrg: maxPersonnel,
			hasDutyRoster: plan.hasDutyRoster,
			hasBulkImport: plan.hasBulkImport,
			hasExcelExport: plan.hasExcelExport,
			hasPrioritySupport: plan.hasPrioritySupport,
			isActive: sub.status === 'active' || sub.status === 'trialing',
			isPastDue: sub.status === 'past_due',
			isTrialing: sub.status === 'trialing',
			isCanceled: sub.status === 'canceled',
			trialDaysRemaining,
			daysUntilRenewal
		};
	}

	// ============================================================
	// Load Methods
	// ============================================================

	load(data: SubscriptionData) {
		this.#subscription = data.subscription;
		this.#plan = data.plan;
		this.#organizationCount = data.organizationCount;
	}

	loadPlans(plans: SubscriptionPlan[]) {
		this.#allPlans = plans;
	}

	updateOrganizationCount(count: number) {
		this.#organizationCount = count;
	}

	// ============================================================
	// Feature Checks
	// ============================================================

	canAddPersonnel(currentCount: number): boolean {
		const maxPersonnel = this.limits.maxPersonnelPerOrg;
		if (maxPersonnel === null) return true;
		return currentCount < maxPersonnel;
	}

	hasFeature(feature: 'dutyRoster' | 'bulkImport' | 'excelExport' | 'prioritySupport'): boolean {
		switch (feature) {
			case 'dutyRoster':
				return this.limits.hasDutyRoster;
			case 'bulkImport':
				return this.limits.hasBulkImport;
			case 'excelExport':
				return this.limits.hasExcelExport;
			case 'prioritySupport':
				return this.limits.hasPrioritySupport;
		}
	}

	// ============================================================
	// Plan Comparison
	// ============================================================

	getPlanById(planId: string): SubscriptionPlan | undefined {
		return this.#allPlans.find((p) => p.id === planId);
	}

	isCurrentPlan(planId: string): boolean {
		return this.#subscription?.planId === planId;
	}

	isUpgrade(planId: string): boolean {
		const currentPlan = this.#plan;
		const targetPlan = this.getPlanById(planId);
		if (!currentPlan || !targetPlan) return false;
		return targetPlan.sortOrder > currentPlan.sortOrder;
	}

	isDowngrade(planId: string): boolean {
		const currentPlan = this.#plan;
		const targetPlan = this.getPlanById(planId);
		if (!currentPlan || !targetPlan) return false;
		return targetPlan.sortOrder < currentPlan.sortOrder;
	}

	// ============================================================
	// Checkout Actions
	// ============================================================

	async createCheckoutSession(planId: string, billingCycle: BillingCycle): Promise<string | null> {
		const res = await fetch('/billing/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ planId, billingCycle })
		});

		if (!res.ok) return null;

		const data = await res.json();
		return data.checkoutUrl;
	}

	async createPortalSession(): Promise<string | null> {
		const res = await fetch('/billing/portal', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});

		if (!res.ok) return null;

		const data = await res.json();
		return data.portalUrl;
	}

	// ============================================================
	// Local State Updates (for optimistic updates)
	// ============================================================

	updateSubscription(updates: Partial<UserSubscription>) {
		if (this.#subscription) {
			this.#subscription = { ...this.#subscription, ...updates };
		}
	}

	setPlan(plan: SubscriptionPlan) {
		this.#plan = plan;
		if (this.#subscription) {
			this.#subscription = { ...this.#subscription, planId: plan.id };
		}
	}
}

export const subscriptionStore = new SubscriptionStore();
