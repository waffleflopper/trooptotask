import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	SubscriptionPlan,
	UserSubscription,
	SubscriptionLimits,
	SubscriptionPlanRow,
	UserSubscriptionRow,
	transformPlanRow,
	transformSubscriptionRow
} from '../types/subscription';

// ============================================================
// Get Subscription Plans
// ============================================================

export async function getSubscriptionPlans(
	supabase: SupabaseClient
): Promise<SubscriptionPlan[]> {
	const { data, error: err } = await supabase
		.from('subscription_plans')
		.select('*')
		.eq('is_active', true)
		.order('sort_order');

	if (err) {
		console.error('Error fetching subscription plans:', err);
		return [];
	}

	return (data as SubscriptionPlanRow[]).map((row) => ({
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
	}));
}

export async function getSubscriptionPlan(
	supabase: SupabaseClient,
	planId: string
): Promise<SubscriptionPlan | null> {
	const { data, error: err } = await supabase
		.from('subscription_plans')
		.select('*')
		.eq('id', planId)
		.single();

	if (err || !data) {
		return null;
	}

	const row = data as SubscriptionPlanRow;
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

// ============================================================
// Get User Subscription
// ============================================================

export async function getUserSubscription(
	supabase: SupabaseClient,
	userId: string
): Promise<{ subscription: UserSubscription; plan: SubscriptionPlan } | null> {
	const { data, error: err } = await supabase
		.from('user_subscriptions')
		.select(`
			*,
			subscription_plans (*)
		`)
		.eq('user_id', userId)
		.single();

	if (err || !data) {
		// User might not have a subscription record yet
		// This should be auto-created on user creation, but handle gracefully
		return null;
	}

	const subRow = data as UserSubscriptionRow & { subscription_plans: SubscriptionPlanRow };
	const planRow = subRow.subscription_plans;

	const subscription: UserSubscription = {
		id: subRow.id,
		userId: subRow.user_id,
		planId: subRow.plan_id,
		billingCycle: subRow.billing_cycle,
		status: subRow.status,
		stripeCustomerId: subRow.stripe_customer_id,
		stripeSubscriptionId: subRow.stripe_subscription_id,
		currentPeriodStart: subRow.current_period_start,
		currentPeriodEnd: subRow.current_period_end,
		trialEnd: subRow.trial_end,
		canceledAt: subRow.canceled_at,
		overrideMaxOrgs: subRow.override_max_orgs,
		overrideMaxPersonnel: subRow.override_max_personnel,
		overrideExpiry: subRow.override_expiry,
		adminNotes: subRow.admin_notes,
		createdAt: subRow.created_at,
		updatedAt: subRow.updated_at
	};

	const plan: SubscriptionPlan = {
		id: planRow.id,
		name: planRow.name,
		description: planRow.description,
		maxOrganizations: planRow.max_organizations,
		maxPersonnelPerOrg: planRow.max_personnel_per_org,
		hasDutyRoster: planRow.has_duty_roster,
		hasBulkImport: planRow.has_bulk_import,
		hasExcelExport: planRow.has_excel_export,
		hasPrioritySupport: planRow.has_priority_support,
		priceMonthly: planRow.price_monthly,
		priceQuarterly: planRow.price_quarterly,
		priceSemiannual: planRow.price_semiannual,
		stripeProductId: planRow.stripe_product_id,
		stripePriceMonthlyId: planRow.stripe_price_monthly_id,
		stripePriceQuarterlyId: planRow.stripe_price_quarterly_id,
		stripePriceSemiannualId: planRow.stripe_price_semiannual_id,
		isActive: planRow.is_active,
		sortOrder: planRow.sort_order
	};

	return { subscription, plan };
}

// ============================================================
// Ensure User Has Subscription
// ============================================================

export async function ensureUserSubscription(
	supabase: SupabaseClient,
	userId: string
): Promise<{ subscription: UserSubscription; plan: SubscriptionPlan }> {
	// Try to get existing subscription
	let result = await getUserSubscription(supabase, userId);

	if (!result) {
		// Create free subscription
		const { error: insertError } = await supabase
			.from('user_subscriptions')
			.insert({
				user_id: userId,
				plan_id: 'free',
				status: 'active'
			});

		if (insertError) {
			console.error('Error creating subscription:', insertError);
			throw error(500, 'Failed to create subscription');
		}

		// Fetch the newly created subscription
		result = await getUserSubscription(supabase, userId);

		if (!result) {
			throw error(500, 'Failed to retrieve subscription after creation');
		}
	}

	return result;
}

// ============================================================
// Count User Organizations
// ============================================================

export async function countUserOrganizations(
	supabase: SupabaseClient,
	userId: string
): Promise<number> {
	const { count, error: err } = await supabase
		.from('organization_memberships')
		.select('*', { count: 'exact', head: true })
		.eq('user_id', userId)
		.eq('role', 'owner');

	if (err) {
		console.error('Error counting organizations:', err);
		return 0;
	}

	return count ?? 0;
}

// ============================================================
// Count Organization Personnel
// ============================================================

export async function countOrganizationPersonnel(
	supabase: SupabaseClient,
	orgId: string
): Promise<number> {
	const { count, error: err } = await supabase
		.from('personnel')
		.select('*', { count: 'exact', head: true })
		.eq('organization_id', orgId);

	if (err) {
		console.error('Error counting personnel:', err);
		return 0;
	}

	return count ?? 0;
}

// ============================================================
// Compute Subscription Limits
// ============================================================

export function computeSubscriptionLimits(
	subscription: UserSubscription,
	plan: SubscriptionPlan,
	organizationCount: number
): SubscriptionLimits {
	const now = new Date();

	// Check for admin overrides
	const overrideActive = subscription.overrideExpiry
		? new Date(subscription.overrideExpiry) > now
		: false;
	const maxOrgs = overrideActive && subscription.overrideMaxOrgs !== null
		? subscription.overrideMaxOrgs
		: plan.maxOrganizations;
	const maxPersonnel = overrideActive && subscription.overrideMaxPersonnel !== null
		? subscription.overrideMaxPersonnel
		: plan.maxPersonnelPerOrg;

	// Calculate trial days remaining
	let trialDaysRemaining: number | null = null;
	if (subscription.status === 'trialing' && subscription.trialEnd) {
		const trialEnd = new Date(subscription.trialEnd);
		const diffMs = trialEnd.getTime() - now.getTime();
		trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
	}

	// Calculate days until renewal
	let daysUntilRenewal: number | null = null;
	if (subscription.currentPeriodEnd && subscription.status === 'active') {
		const periodEnd = new Date(subscription.currentPeriodEnd);
		const diffMs = periodEnd.getTime() - now.getTime();
		daysUntilRenewal = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
	}

	return {
		maxOrganizations: maxOrgs,
		currentOrganizations: organizationCount,
		canCreateOrganization: maxOrgs === null || organizationCount < maxOrgs,
		maxPersonnelPerOrg: maxPersonnel,
		hasDutyRoster: plan.hasDutyRoster,
		hasBulkImport: plan.hasBulkImport,
		hasExcelExport: plan.hasExcelExport,
		hasPrioritySupport: plan.hasPrioritySupport,
		isActive: subscription.status === 'active' || subscription.status === 'trialing',
		isPastDue: subscription.status === 'past_due',
		isTrialing: subscription.status === 'trialing',
		isCanceled: subscription.status === 'canceled',
		trialDaysRemaining,
		daysUntilRenewal
	};
}

// ============================================================
// Limit Check Functions (throw errors when limits exceeded)
// ============================================================

export async function checkOrganizationLimit(
	supabase: SupabaseClient,
	userId: string
): Promise<void> {
	const subData = await getUserSubscription(supabase, userId);

	if (!subData) {
		// No subscription = free tier with 1 org limit
		const orgCount = await countUserOrganizations(supabase, userId);
		if (orgCount >= 1) {
			throw error(403, 'Organization limit reached. Upgrade your plan to create more organizations.');
		}
		return;
	}

	const { subscription, plan } = subData;
	const orgCount = await countUserOrganizations(supabase, userId);
	const limits = computeSubscriptionLimits(subscription, plan, orgCount);

	if (!limits.canCreateOrganization) {
		throw error(403, `Organization limit reached (${limits.maxOrganizations}). Upgrade your plan to create more organizations.`);
	}
}

export async function checkPersonnelLimit(
	supabase: SupabaseClient,
	userId: string,
	orgId: string
): Promise<void> {
	const subData = await getUserSubscription(supabase, userId);

	if (!subData) {
		// No subscription = free tier with 25 personnel limit
		const personnelCount = await countOrganizationPersonnel(supabase, orgId);
		if (personnelCount >= 25) {
			throw error(403, 'Personnel limit reached. Upgrade your plan to add more personnel.');
		}
		return;
	}

	const { subscription, plan } = subData;
	const limits = computeSubscriptionLimits(subscription, plan, 0);

	// null means unlimited
	if (limits.maxPersonnelPerOrg === null) {
		return;
	}

	const personnelCount = await countOrganizationPersonnel(supabase, orgId);
	if (personnelCount >= limits.maxPersonnelPerOrg) {
		throw error(403, `Personnel limit reached (${limits.maxPersonnelPerOrg}). Upgrade your plan to add more personnel.`);
	}
}

export async function checkFeatureAccess(
	supabase: SupabaseClient,
	userId: string,
	feature: 'dutyRoster' | 'bulkImport' | 'excelExport' | 'prioritySupport'
): Promise<void> {
	const subData = await getUserSubscription(supabase, userId);

	if (!subData) {
		// No subscription = free tier with no premium features
		throw error(403, 'This feature requires a paid subscription. Upgrade your plan to access this feature.');
	}

	const { subscription, plan } = subData;

	// Check subscription is active
	if (subscription.status !== 'active' && subscription.status !== 'trialing') {
		throw error(403, 'Your subscription is not active. Please update your payment method to access this feature.');
	}

	// Check feature access
	let hasAccess = false;
	switch (feature) {
		case 'dutyRoster':
			hasAccess = plan.hasDutyRoster;
			break;
		case 'bulkImport':
			hasAccess = plan.hasBulkImport;
			break;
		case 'excelExport':
			hasAccess = plan.hasExcelExport;
			break;
		case 'prioritySupport':
			hasAccess = plan.hasPrioritySupport;
			break;
	}

	if (!hasAccess) {
		throw error(403, 'This feature is not available on your current plan. Upgrade to access this feature.');
	}
}

// ============================================================
// Update Subscription from Stripe
// ============================================================

export async function updateSubscriptionFromStripe(
	supabase: SupabaseClient,
	userId: string,
	updates: Partial<{
		plan_id: string;
		billing_cycle: string;
		status: string;
		stripe_customer_id: string;
		stripe_subscription_id: string;
		current_period_start: string;
		current_period_end: string;
		trial_end: string | null;
		canceled_at: string | null;
	}>
): Promise<void> {
	const { error: err } = await supabase
		.from('user_subscriptions')
		.update({
			...updates,
			updated_at: new Date().toISOString()
		})
		.eq('user_id', userId);

	if (err) {
		console.error('Error updating subscription:', err);
		throw error(500, 'Failed to update subscription');
	}
}

// ============================================================
// Admin Functions
// ============================================================

export async function isPlatformAdmin(
	supabase: SupabaseClient,
	userId: string
): Promise<boolean> {
	// Use the database function which is SECURITY DEFINER and bypasses RLS
	const { data, error: err } = await supabase.rpc('is_platform_admin');

	if (err) {
		console.error('Error checking platform admin status:', err);
		return false;
	}

	return data === true;
}

export async function requirePlatformAdmin(
	supabase: SupabaseClient,
	userId: string
): Promise<void> {
	const isAdmin = await isPlatformAdmin(supabase, userId);
	if (!isAdmin) {
		throw error(403, 'Access denied. Platform admin required.');
	}
}

export async function getAdminRole(
	supabase: SupabaseClient,
	userId: string
): Promise<'super_admin' | 'support' | 'billing' | null> {
	const { data, error: err } = await supabase
		.from('platform_admins')
		.select('role')
		.eq('user_id', userId)
		.eq('is_active', true)
		.single();

	if (err || !data) {
		return null;
	}

	return data.role as 'super_admin' | 'support' | 'billing';
}
