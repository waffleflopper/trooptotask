import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const supabase = locals.supabase;
	const { userId } = params;

	// Get user subscription with plan
	const { data: subscription, error: subError } = await supabase
		.from('user_subscriptions')
		.select(`
			*,
			subscription_plans (*)
		`)
		.eq('user_id', userId)
		.single();

	if (subError || !subscription) {
		throw error(404, 'User not found');
	}

	// Get user's organizations
	const { data: organizations } = await supabase
		.from('organization_memberships')
		.select('organization_id, role, organizations(id, name)')
		.eq('user_id', userId);

	// Get payment history
	const { data: payments } = await supabase
		.from('payment_history')
		.select('*')
		.eq('user_id', userId)
		.order('created_at', { ascending: false })
		.limit(20);

	// Get admin audit log for this user
	const { data: auditLog } = await supabase
		.from('admin_audit_log')
		.select('*')
		.eq('target_user_id', userId)
		.order('created_at', { ascending: false })
		.limit(10);

	// Get all plans for grant subscription dropdown
	const { data: allPlans } = await supabase
		.from('subscription_plans')
		.select('id, name')
		.eq('is_active', true)
		.order('sort_order');

	return {
		user: {
			id: userId,
			subscription: {
				id: subscription.id,
				planId: subscription.plan_id,
				planName: subscription.subscription_plans?.name || subscription.plan_id,
				billingCycle: subscription.billing_cycle,
				status: subscription.status,
				stripeCustomerId: subscription.stripe_customer_id,
				stripeSubscriptionId: subscription.stripe_subscription_id,
				currentPeriodEnd: subscription.current_period_end,
				trialEnd: subscription.trial_end,
				canceledAt: subscription.canceled_at,
				overrideMaxOrgs: subscription.override_max_orgs,
				overrideMaxPersonnel: subscription.override_max_personnel,
				overrideExpiry: subscription.override_expiry,
				adminNotes: subscription.admin_notes,
				createdAt: subscription.created_at,
				updatedAt: subscription.updated_at
			},
			plan: subscription.subscription_plans
		},
		organizations: (organizations ?? []).map((o: any) => ({
			id: o.organizations?.id,
			name: o.organizations?.name,
			role: o.role
		})),
		payments: (payments ?? []).map((p: any) => ({
			id: p.id,
			amount: p.amount,
			currency: p.currency,
			status: p.status,
			description: p.description,
			receiptUrl: p.receipt_url,
			createdAt: p.created_at
		})),
		auditLog: (auditLog ?? []).map((a: any) => ({
			id: a.id,
			action: a.action,
			details: a.details,
			createdAt: a.created_at
		})),
		allPlans: allPlans ?? []
	};
};

export const actions: Actions = {
	extendTrial: async ({ params, request, locals }) => {
		const { userId } = params;
		const formData = await request.formData();
		const days = parseInt(formData.get('days') as string);

		if (!days || days < 1 || days > 365) {
			return fail(400, { error: 'Invalid number of days' });
		}

		const { error: rpcError } = await locals.supabase.rpc('extend_user_trial', {
			p_user_id: userId,
			p_days: days
		});

		if (rpcError) {
			return fail(500, { error: rpcError.message });
		}

		return { success: true, action: 'extendTrial' };
	},

	grantSubscription: async ({ params, request, locals }) => {
		const { userId } = params;
		const formData = await request.formData();
		const planId = formData.get('planId') as string;
		const durationDays = parseInt(formData.get('durationDays') as string) || null;
		const maxOrgs = formData.get('maxOrgs') ? parseInt(formData.get('maxOrgs') as string) : null;
		const maxPersonnel = formData.get('maxPersonnel') ? parseInt(formData.get('maxPersonnel') as string) : null;

		if (!planId) {
			return fail(400, { error: 'Plan is required' });
		}

		const { error: rpcError } = await locals.supabase.rpc('grant_subscription', {
			p_user_id: userId,
			p_plan_id: planId,
			p_duration_days: durationDays,
			p_max_orgs: maxOrgs,
			p_max_personnel: maxPersonnel
		});

		if (rpcError) {
			return fail(500, { error: rpcError.message });
		}

		return { success: true, action: 'grantSubscription' };
	},

	updateNotes: async ({ params, request, locals }) => {
		const { userId } = params;
		const formData = await request.formData();
		const notes = formData.get('notes') as string;

		const { error: rpcError } = await locals.supabase.rpc('update_admin_notes', {
			p_user_id: userId,
			p_notes: notes || null
		});

		if (rpcError) {
			return fail(500, { error: rpcError.message });
		}

		return { success: true, action: 'updateNotes' };
	}
};
