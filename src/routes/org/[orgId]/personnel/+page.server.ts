import type { PageServerLoad } from './$types';
import type { Personnel } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { orgId } = params;

	const [personnelRes, groupsRes, pinnedGroupsRes] = await Promise.all([
		locals.supabase
			.from('personnel')
			.select('*, groups(name)')
			.eq('organization_id', orgId)
			.order('last_name'),
		locals.supabase.from('groups').select('*').eq('organization_id', orgId).order('sort_order'),
		locals.supabase
			.from('user_pinned_groups')
			.select('*')
			.eq('organization_id', orgId)
			.eq('user_id', locals.user?.id)
			.order('sort_order')
	]);

	const personnel: Personnel[] = (personnelRes.data ?? []).map((p: any) => ({
		id: p.id,
		rank: p.rank,
		lastName: p.last_name,
		firstName: p.first_name,
		mos: p.mos ?? '',
		clinicRole: p.clinic_role,
		groupId: p.group_id,
		groupName: p.groups?.name ?? ''
	}));

	const groups: Group[] = (groupsRes.data ?? []).map((g: any) => ({
		id: g.id,
		name: g.name,
		sortOrder: g.sort_order
	}));

	const pinnedGroups: string[] = (pinnedGroupsRes.data ?? []).map((p: any) => p.group_name);

	return {
		orgId,
		personnel,
		groups,
		pinnedGroups
	};
};
