import type { PageServerLoad } from './$types';
import type { Personnel } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { clinicId } = params;

	const [personnelRes, groupsRes, pinnedGroupsRes] = await Promise.all([
		locals.supabase
			.from('personnel')
			.select('*, groups(name)')
			.eq('clinic_id', clinicId)
			.order('last_name'),
		locals.supabase.from('groups').select('*').eq('clinic_id', clinicId).order('sort_order'),
		locals.supabase
			.from('user_pinned_groups')
			.select('*')
			.eq('clinic_id', clinicId)
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
		clinicId,
		personnel,
		groups,
		pinnedGroups
	};
};
