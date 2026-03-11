import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isFullEditor, type OrganizationMemberPermissions } from '$lib/types';
import { getSupabaseClient } from '$lib/server/supabase';
import { getEffectiveTier } from '$lib/server/subscription';
import {
	transformPersonnel,
	transformGroups,
	transformStatusTypes,
	transformTrainingTypes,
	transformPersonnelTrainings
} from '$lib/server/transforms';

async function fetchSharedData(supabase: any, orgId: string) {
	const [personnelRes, groupsRes, statusTypesRes, trainingTypesRes, personnelTrainingsRes, activeOnboardingsRes] =
		await Promise.all([
			supabase
				.from('personnel')
				.select('*, groups(name)')
				.eq('organization_id', orgId)
				.is('archived_at', null)
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
			canViewOnboarding: true,
			canEditOnboarding: false,
			canViewLeadersBook: true,
			canEditLeadersBook: false,
			canManageMembers: false
		};

		const [shared, effectiveTier] = await Promise.all([
			fetchSharedData(supabase, orgId),
			getEffectiveTier(supabase, orgId)
		]);

		return {
			orgId,
			orgName: org.name,
			userRole: 'member' as const,
			userId: null,
			permissions: readOnlyPermissions,
			isFullEditor: false,
			unreadNotificationCount: 0,
			scopedGroupId: null,
			isOwner: false,
			isAdmin: false,
			allOrgs: [],
			effectiveTier,

			isDemoReadOnly: true,
			isDemoSandbox: false,
			...shared,
			allPersonnel: shared.personnel
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
					canViewOnboarding: true,
					canEditOnboarding: true,
					canViewLeadersBook: true,
					canEditLeadersBook: true,
					canManageMembers: true
				};

				const [shared, effectiveTier] = await Promise.all([
					fetchSharedData(supabase, orgId),
					getEffectiveTier(supabase, orgId)
				]);

				return {
					orgId,
					orgName: org.name,
					userRole: 'owner' as const,
					userId: null,
					permissions: fullPermissions,
					isFullEditor: true,
					unreadNotificationCount: 0,
					scopedGroupId: null,
					isOwner: true,
					isAdmin: false,
					allOrgs: [],
					effectiveTier,

					isDemoReadOnly: false,
					isDemoSandbox: true,
					...shared,
					allPersonnel: shared.personnel
				};
			}
		} catch {
			// Invalid cookie, ignore
		}
	}

	// For non-demo access, require login
	if (!user) throw redirect(303, '/auth/login');

	// Parallelize: membership + allOrgs (single query), shared entity data, and tier
	const [membershipsRes, shared, effectiveTier] = await Promise.all([
		locals.supabase
			.from('organization_memberships')
			.select(
				'organization_id, role, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members, scoped_group_id, organizations(id, name)'
			)
			.eq('user_id', user.id),
		fetchSharedData(supabase, orgId),
		getEffectiveTier(supabase, orgId)
	]);

	const allMemberships = membershipsRes.data ?? [];
	const membership = allMemberships.find((m: any) => m.organization_id === orgId);
	if (!membership) {
		throw error(403, 'You are not a member of this organization');
	}

	const allOrgs = allMemberships
		.filter((m: any) => m.organizations)
		.map((m: any) => ({
			id: m.organizations.id,
			name: m.organizations.name,
			role: m.role
		}));

	const isOwner = membership.role === 'owner';
	const isAdmin = membership.role === 'admin';
	const isPrivileged = isOwner || isAdmin;

	// Build permissions object - owners and admins always have full access
	const permissions: OrganizationMemberPermissions = {
		canViewCalendar: isPrivileged || membership.can_view_calendar,
		canEditCalendar: isPrivileged || membership.can_edit_calendar,
		canViewPersonnel: isPrivileged || membership.can_view_personnel,
		canEditPersonnel: isPrivileged || membership.can_edit_personnel,
		canViewTraining: isPrivileged || membership.can_view_training,
		canEditTraining: isPrivileged || membership.can_edit_training,
		canViewOnboarding: isPrivileged || membership.can_view_onboarding,
		canEditOnboarding: isPrivileged || membership.can_edit_onboarding,
		canViewLeadersBook: isPrivileged || membership.can_view_leaders_book,
		canEditLeadersBook: isPrivileged || membership.can_edit_leaders_book,
		canManageMembers: isPrivileged || membership.can_manage_members
	};

	const scopedGroupId: string | null =
		isPrivileged ? null : (membership.scoped_group_id ?? null);

	const fullEditor = !isPrivileged && !scopedGroupId && isFullEditor(permissions);

	const { count: unreadNotificationCount } = await locals.supabase
		.from('notifications')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', user.id)
		.eq('organization_id', orgId)
		.eq('read', false);

	// Filter personnel data for group-scoped members
	let { personnel, groups, statusTypes, trainingTypes, personnelTrainings, activeOnboardingPersonnelIds } = shared;
	const allPersonnel = personnel; // Keep unscoped list for calendar viewing

	if (scopedGroupId) {
		const scopedPersonnelIds = new Set(
			personnel.filter((p: any) => p.groupId === scopedGroupId).map((p: any) => p.id)
		);
		personnel = personnel.filter((p: any) => p.groupId === scopedGroupId);
		personnelTrainings = personnelTrainings.filter((pt: any) => scopedPersonnelIds.has(pt.personnelId));
		activeOnboardingPersonnelIds = activeOnboardingPersonnelIds.filter((id: string) => scopedPersonnelIds.has(id));
	}

	return {
		orgId,
		orgName: org.name,
		userRole: membership.role as 'owner' | 'admin' | 'member',
		userId: user.id,
		permissions,
		isFullEditor: fullEditor,
		unreadNotificationCount: unreadNotificationCount ?? 0,
		scopedGroupId,
		isOwner,
		isAdmin,
		allOrgs,
		effectiveTier,
		isDemoReadOnly: false,
		isDemoSandbox: false,
		personnel,
		allPersonnel,
		groups,
		statusTypes,
		trainingTypes,
		personnelTrainings,
		activeOnboardingPersonnelIds
	};
};
