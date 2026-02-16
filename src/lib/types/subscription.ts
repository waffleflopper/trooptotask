// ============================================================
// Subscription & Billing Types
// ============================================================

export type BillingCycle = 'monthly' | 'quarterly' | 'semiannual';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled';
export type PaymentStatus = 'succeeded' | 'failed' | 'refunded' | 'pending';
export type AdminRole = 'super_admin' | 'support' | 'billing';

// ============================================================
// Subscription Plan (from subscription_plans table)
// ============================================================

export interface SubscriptionPlan {
	id: string; // 'free', 'pro', 'team'
	name: string;
	description: string | null;
	maxOrganizations: number | null; // null = unlimited
	maxPersonnelPerOrg: number | null; // null = unlimited
	hasDutyRoster: boolean;
	hasBulkImport: boolean;
	hasExcelExport: boolean;
	hasPrioritySupport: boolean;
	priceMonthly: number; // cents
	priceQuarterly: number; // cents
	priceSemiannual: number; // cents
	stripeProductId: string | null;
	stripePriceMonthlyId: string | null;
	stripePriceQuarterlyId: string | null;
	stripePriceSemiannualId: string | null;
	isActive: boolean;
	sortOrder: number;
}

// ============================================================
// User Subscription (from user_subscriptions table)
// ============================================================

export interface UserSubscription {
	id: string;
	userId: string;
	planId: string;
	billingCycle: BillingCycle;
	status: SubscriptionStatus;
	stripeCustomerId: string | null;
	stripeSubscriptionId: string | null;
	currentPeriodStart: string | null;
	currentPeriodEnd: string | null;
	trialEnd: string | null;
	canceledAt: string | null;
	overrideMaxOrgs: number | null;
	overrideMaxPersonnel: number | null;
	overrideExpiry: string | null;
	adminNotes: string | null;
	createdAt: string;
	updatedAt: string;
}

// ============================================================
// Subscription with Plan Details (joined data)
// ============================================================

export interface SubscriptionWithPlan extends UserSubscription {
	plan: SubscriptionPlan;
}

// ============================================================
// Subscription Limits (computed from subscription + plan)
// ============================================================

export interface SubscriptionLimits {
	// Organization limits
	maxOrganizations: number | null; // null = unlimited
	currentOrganizations: number;
	canCreateOrganization: boolean;

	// Personnel limits (per organization)
	maxPersonnelPerOrg: number | null; // null = unlimited

	// Feature access
	hasDutyRoster: boolean;
	hasBulkImport: boolean;
	hasExcelExport: boolean;
	hasPrioritySupport: boolean;

	// Subscription status
	isActive: boolean;
	isPastDue: boolean;
	isTrialing: boolean;
	isCanceled: boolean;
	trialDaysRemaining: number | null;
	daysUntilRenewal: number | null;
}

// ============================================================
// Payment History (from payment_history table)
// ============================================================

export interface PaymentHistory {
	id: string;
	userId: string;
	subscriptionId: string | null;
	stripeInvoiceId: string | null;
	stripePaymentIntentId: string | null;
	amount: number; // cents
	currency: string;
	status: PaymentStatus;
	description: string | null;
	receiptUrl: string | null;
	createdAt: string;
}

// ============================================================
// Platform Admin (from platform_admins table)
// ============================================================

export interface PlatformAdmin {
	id: string;
	userId: string;
	email?: string; // From user lookup
	role: AdminRole;
	isActive: boolean;
	createdAt: string;
}

// ============================================================
// Admin Audit Log (from admin_audit_log table)
// ============================================================

export interface AdminAuditLog {
	id: string;
	adminUserId: string;
	adminEmail?: string; // From user lookup
	targetUserId: string | null;
	targetEmail?: string; // From user lookup
	action: string;
	details: Record<string, unknown> | null;
	createdAt: string;
}

// ============================================================
// Admin Actions
// ============================================================

export type AdminAction =
	| 'extend_trial'
	| 'grant_subscription'
	| 'update_notes'
	| 'override_limits'
	| 'cancel_subscription'
	| 'view_user';

// ============================================================
// Stripe Webhook Events (from stripe_webhook_events table)
// ============================================================

export interface StripeWebhookEvent {
	id: string; // Stripe event ID
	type: string;
	data: Record<string, unknown>;
	processed: boolean;
	processedAt: string | null;
	error: string | null;
	createdAt: string;
}

// ============================================================
// API Request/Response Types
// ============================================================

export interface CreateCheckoutSessionRequest {
	planId: string;
	billingCycle: BillingCycle;
	successUrl?: string;
	cancelUrl?: string;
}

export interface CreateCheckoutSessionResponse {
	checkoutUrl: string;
	sessionId: string;
}

export interface CreatePortalSessionResponse {
	portalUrl: string;
}

// ============================================================
// Admin Dashboard Types
// ============================================================

export interface AdminMetrics {
	totalUsers: number;
	activeSubscriptions: number;
	freeUsers: number;
	proUsers: number;
	teamUsers: number;
	pastDueUsers: number;
	mrr: number; // Monthly Recurring Revenue in cents
	newUsersThisMonth: number;
	churnedThisMonth: number;
}

export interface AdminUserSummary {
	id: string;
	email: string;
	planId: string;
	planName: string;
	status: SubscriptionStatus;
	organizationCount: number;
	createdAt: string;
	lastPaymentAt: string | null;
	totalPaid: number; // cents
}

// ============================================================
// Database Row Types (for Supabase queries)
// ============================================================

export interface SubscriptionPlanRow {
	id: string;
	name: string;
	description: string | null;
	max_organizations: number | null;
	max_personnel_per_org: number | null;
	has_duty_roster: boolean;
	has_bulk_import: boolean;
	has_excel_export: boolean;
	has_priority_support: boolean;
	price_monthly: number;
	price_quarterly: number;
	price_semiannual: number;
	stripe_product_id: string | null;
	stripe_price_monthly_id: string | null;
	stripe_price_quarterly_id: string | null;
	stripe_price_semiannual_id: string | null;
	is_active: boolean;
	sort_order: number;
	created_at: string;
}

export interface UserSubscriptionRow {
	id: string;
	user_id: string;
	plan_id: string;
	billing_cycle: BillingCycle;
	status: SubscriptionStatus;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	current_period_start: string | null;
	current_period_end: string | null;
	trial_end: string | null;
	canceled_at: string | null;
	override_max_orgs: number | null;
	override_max_personnel: number | null;
	override_expiry: string | null;
	admin_notes: string | null;
	created_at: string;
	updated_at: string;
}

export interface PaymentHistoryRow {
	id: string;
	user_id: string;
	subscription_id: string | null;
	stripe_invoice_id: string | null;
	stripe_payment_intent_id: string | null;
	amount: number;
	currency: string;
	status: PaymentStatus;
	description: string | null;
	receipt_url: string | null;
	created_at: string;
}

// ============================================================
// Transform Functions
// ============================================================

export function transformPlanRow(row: SubscriptionPlanRow): SubscriptionPlan {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		maxOrganizations: row.max_organizations,
		maxPersonnelPerOrg: row.max_personnel_per_org,
		hasDutyRoster: row.has_duty_roster,
		hasBulkImport: row.has_bulk_import,
		hasExcelExport: row.has_excel_export,
		hasPrioritySupport: row.has_priority_support,
		priceMonthly: row.price_monthly,
		priceQuarterly: row.price_quarterly,
		priceSemiannual: row.price_semiannual,
		stripeProductId: row.stripe_product_id,
		stripePriceMonthlyId: row.stripe_price_monthly_id,
		stripePriceQuarterlyId: row.stripe_price_quarterly_id,
		stripePriceSemiannualId: row.stripe_price_semiannual_id,
		isActive: row.is_active,
		sortOrder: row.sort_order
	};
}

export function transformSubscriptionRow(row: UserSubscriptionRow): UserSubscription {
	return {
		id: row.id,
		userId: row.user_id,
		planId: row.plan_id,
		billingCycle: row.billing_cycle,
		status: row.status,
		stripeCustomerId: row.stripe_customer_id,
		stripeSubscriptionId: row.stripe_subscription_id,
		currentPeriodStart: row.current_period_start,
		currentPeriodEnd: row.current_period_end,
		trialEnd: row.trial_end,
		canceledAt: row.canceled_at,
		overrideMaxOrgs: row.override_max_orgs,
		overrideMaxPersonnel: row.override_max_personnel,
		overrideExpiry: row.override_expiry,
		adminNotes: row.admin_notes,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

export function transformPaymentRow(row: PaymentHistoryRow): PaymentHistory {
	return {
		id: row.id,
		userId: row.user_id,
		subscriptionId: row.subscription_id,
		stripeInvoiceId: row.stripe_invoice_id,
		stripePaymentIntentId: row.stripe_payment_intent_id,
		amount: row.amount,
		currency: row.currency,
		status: row.status,
		description: row.description,
		receiptUrl: row.receipt_url,
		createdAt: row.created_at
	};
}

// ============================================================
// Utility Functions
// ============================================================

export function formatPrice(cents: number): string {
	return `$${(cents / 100).toFixed(2)}`;
}

export function getPriceForCycle(plan: SubscriptionPlan, cycle: BillingCycle): number {
	switch (cycle) {
		case 'monthly':
			return plan.priceMonthly;
		case 'quarterly':
			return plan.priceQuarterly;
		case 'semiannual':
			return plan.priceSemiannual;
	}
}

export function getMonthlyEquivalent(plan: SubscriptionPlan, cycle: BillingCycle): number {
	switch (cycle) {
		case 'monthly':
			return plan.priceMonthly;
		case 'quarterly':
			return Math.round(plan.priceQuarterly / 3);
		case 'semiannual':
			return Math.round(plan.priceSemiannual / 6);
	}
}

export function getSavingsPercent(plan: SubscriptionPlan, cycle: BillingCycle): number {
	if (cycle === 'monthly' || plan.priceMonthly === 0) return 0;
	const monthlyTotal =
		cycle === 'quarterly' ? plan.priceMonthly * 3 : plan.priceMonthly * 6;
	const actualPrice = getPriceForCycle(plan, cycle);
	return Math.round(((monthlyTotal - actualPrice) / monthlyTotal) * 100);
}

export function getBillingCycleLabel(cycle: BillingCycle): string {
	switch (cycle) {
		case 'monthly':
			return 'Monthly';
		case 'quarterly':
			return 'Quarterly';
		case 'semiannual':
			return 'Semi-annual';
	}
}

export function getStatusLabel(status: SubscriptionStatus): string {
	switch (status) {
		case 'active':
			return 'Active';
		case 'trialing':
			return 'Trial';
		case 'past_due':
			return 'Past Due';
		case 'canceled':
			return 'Canceled';
	}
}

export function getStatusColor(status: SubscriptionStatus): string {
	switch (status) {
		case 'active':
			return '#22c55e'; // green
		case 'trialing':
			return '#3b82f6'; // blue
		case 'past_due':
			return '#f97316'; // orange
		case 'canceled':
			return '#6b7280'; // gray
	}
}
