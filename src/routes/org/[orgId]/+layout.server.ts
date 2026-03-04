import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { OrganizationMemberPermissions, Personnel, StatusType, TrainingType, PersonnelTraining } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import {
	ensureUserSubscription,
	countUserOrganizations,
	countOrganizationPersonnel,
	computeSubscriptionLimits
} from '$lib/server/subscription';
import { isBillingEnabled } from '$lib/config/billing';
import { getSupabaseClient } from '$lib/server/supabase';

function transformPersonnel(data: any[]): Personnel[] {
	return data.map((p: any) => ({
		id: p.id,
		rank: p.rank,
		lastName: p.last_name,
		firstName: p.first_name,
		mos: p.mos ?? '',
		clinicRole: p.clinic_role,
		groupId: p.group_id,
		groupName: p.groups?.name ?? ''
	}));
}

function transformGroups(data: any[]): Group[] {
	return data.map((g: any) => ({
		id: g.id,
		name: g.name,
		sortOrder: g.sort_order
	}));
}

function transformStatusTypes(data: any[]): StatusType[] {
	return data.map((s: any) => ({
		id: s.id,
		name: s.name,
		color: s.color,
		textColor: s.text_color
	}));
}

function transformTrainingTypes(data: any[]): TrainingType[] {
	return data.map((t: any) => ({
		id: t.id,
		name: t.name,
		description: t.description,
		expirationMonths: t.expiration_months,
		warningDaysYellow: t.warning_days_yellow,
		warningDaysOrange: t.warning_days_orange,
		requiredForRoles: t.required_for_roles ?? [],
		color: t.color,
		sortOrder: t.sort_order,
		expirationDateOnly: t.expiration_date_only ?? false,
		canBeExempted: t.can_be_exempted ?? false,
		exemptPersonnelIds: t.exempt_personnel_ids ?? []
	}));
}

function transformPersonnelTrainings(data: any[]): PersonnelTraining[] {
	return data.map((t: any) => ({
		id: t.id,
		personnelId: t.personnel_id,
		trainingTypeId: t.training_type_id,
		completionDate: t.completion_date,
		expirationDate: t.expiration_date,
		notes: t.notes,
		certificateUrl: t.certificate_url
	}));
}

async function fetchSharedData(supabase: any, orgId: string) {
	const [personnelRes, groupsRes, statusTypesRes, trainingTypesRes, personnelTrainingsRes, activeOnboardingsRes] =
		await Promise.all([
			supabase
				.from('personnel')
				.select('*, groups(name)')
				.eq('organization_id', orgId)
				.order('last_name'),
			supabase.from('groups').select('*').eq('organization_id', orgId).order('sort_order'),
			supabase.from('status_types').select('*').eq('organization_id', orgId).order('sort_order'),
			supabase
				.from('training_types')
				.select('*')
				.eq('organization_id', orgId)
				.order('sort_order'),
			supabase.from('personnel_trainings').select('*').eq('organization_id', orgId),
			supabase
				.from('personnel_onboardings')
				.select('personnel_id')
				.eq('organization_id', orgId)
				.eq('status', 'in_progress')
		]);

	return {
		personnel: transformPersonnel(personnelRes.data ?? []),
		groups: transformGroups(groupsRes.data ?? []),
		statusTypes: transformStatusTypes(statusTypesRes.data ?? []),
		trainingTypes: transformTrainingTypes(trainingTypesRes.data ?? []),
		personnelTrainings: transformPersonnelTrainings(personnelTrainingsRes.data ?? []),
		activeOnboardingPersonnelIds: (activeOnboardingsRes.data ?? []).map((r: any) => r.personnel_id) as string[]
	};
}

export const load: LayoutServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:shared-data');

	const user = locals.user;
	const { orgId } = params;

	// Check for demo mode
	const demoMode = cookies.get('demo_mode');
	const demoSandboxCookie = cookies.get('demo_sandbox');
	const isDemoReadOnly = demoMode === 'readonly';

	// Get appropriate supabase client (service role for demo mode)
	const supabase = getSupabaseClient(locals, cookies);

	// Get organization info (including demo_type)
	const { data: org } = await supabase
		.from('organizations')
		.select('id, name, demo_type')
		.eq('id', orgId)
		.single();

	if (!org) {
		throw error(404, 'Organization not found');
	}

	// Handle demo showcase access (no login required for read-only viewing)
	if (org.demo_type === 'showcase' && isDemoReadOnly) {
		const readOnlyPermissions: OrganizationMemberPermissions = {
			canViewCalendar: true,
			canEditCalendar: false,
			canViewPersonnel: true,
			canEditPersonnel: false,
			canViewTraining: true,
			canEditTraining: false,
			canManageMembers: false
		};

		const shared = await fetchSharedData(supabase, orgId);

		return {
			orgId,
			orgName: org.name,
			userRole: 'member' as const,
			userId: null,
			permissions: readOnlyPermissions,
			allOrgs: [],
			subscriptionLimits: null,
			isDemoReadOnly: true,
			isDemoSandbox: false,
			...shared
		};
	}

	// Handle demo sandbox access (no login required, full access to sandbox)
	if (org.demo_type === 'sandbox' && demoSandboxCookie) {
		try {
			const sandboxInfo = JSON.parse(demoSandboxCookie);
			if (sandboxInfo.orgId === orgId) {
				const fullPermissions: OrganizationMemberPermissions = {
					canViewCalendar: true,
					canEditCalendar: true,
					canViewPersonnel: true,
					canEditPersonnel: true,
					canViewTraining: true,
					canEditTraining: true,
					canManageMembers: true
				};

				const shared = await fetchSharedData(supabase, orgId);

				return {
					orgId,
					orgName: org.name,
					userRole: 'owner' as const,
					userId: null,
					permissions: fullPermissions,
					allOrgs: [],
					subscriptionLimits: null,
					isDemoReadOnly: false,
					isDemoSandbox: true,
					...shared
				};
			}
		} catch {
			// Invalid cookie, ignore
		}
	}

	// For non-demo access, require login
	if (!user) throw redirect(303, '/auth/login');

	// Parallelize: membership check, allOrgs, ownerMembership, and shared entity data
	const [membershipRes, membershipsRes, ownerMembershipRes, shared] = await Promise.all([
		locals.supabase
			.from('organization_memberships')
			.select(
				'role, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_manage_members'
			)
			.eq('organization_id', orgId)
			.eq('user_id', user.id)
			.single(),
		locals.supabase
			.from('organization_memberships')
			.select('organization_id, role, organizations(id, name)')
			.eq('user_id', user.id),
		locals.supabase
			.from('organization_memberships')
			.select('user_id')
			.eq('organization_id', orgId)
			.eq('role', 'owner')
			.single(),
		fetchSharedData(supabase, orgId)
	]);

	const membership = membershipRes.data;
	if (!membership) {
		throw error(403, 'You are not a member of this organization');
	}

	const allOrgs = (membershipsRes.data ?? [])
		.filter((m: any) => m.organizations)
		.map((m: any) => ({
			id: m.organizations.id,
			name: m.organizations.name,
			role: m.role
		}));

	const isOwner = membership.role === 'owner';

	// Build permissions object - owners always have full access
	const permissions: OrganizationMemberPermissions = {
		canViewCalendar: isOwner || membership.can_view_calendar,
		canEditCalendar: isOwner || membership.can_edit_calendar,
		canViewPersonnel: isOwner || membership.can_view_personnel,
		canEditPersonnel: isOwner || membership.can_edit_personnel,
		canViewTraining: isOwner || membership.can_view_training,
		canEditTraining: isOwner || membership.can_edit_training,
		canManageMembers: isOwner || membership.can_manage_members
	};

	// Get subscription limits (billing queries need ownerMembership.user_id)
	let subscriptionLimits = null;
	const ownerMembership = ownerMembershipRes.data;
	if (isBillingEnabled && ownerMembership) {
		const [{ subscription, plan }, orgCount, personnelCount] = await Promise.all([
			ensureUserSubscription(locals.supabase, ownerMembership.user_id),
			countUserOrganizations(locals.supabase, ownerMembership.user_id),
			countOrganizationPersonnel(locals.supabase, orgId)
		]);
		const limits = computeSubscriptionLimits(subscription, plan, orgCount);

		subscriptionLimits = {
			...limits,
			currentPersonnel: personnelCount,
			canAddPersonnel: limits.maxPersonnelPerOrg === null || personnelCount < limits.maxPersonnelPerOrg,
			planId: plan.id,
			planName: plan.name
		};
	}

	return {
		orgId,
		orgName: org.name,
		userRole: membership.role as 'owner' | 'member',
		userId: user.id,
		permissions,
		allOrgs,
		subscriptionLimits,
		isDemoReadOnly: false,
		isDemoSandbox: false,
		...shared
	};
};
