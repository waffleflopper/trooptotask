import type { PageServerLoad } from './$types';
import type { Personnel, TrainingType, PersonnelTraining } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { orgId } = params;

	// Load all data in parallel
	const [personnelRes, groupsRes, trainingTypesRes, personnelTrainingsRes] = await Promise.all([
		locals.supabase
			.from('personnel')
			.select('*, groups(name)')
			.eq('organization_id', orgId)
			.order('last_name'),
		locals.supabase.from('groups').select('*').eq('organization_id', orgId).order('sort_order'),
		locals.supabase
			.from('training_types')
			.select('*')
			.eq('organization_id', orgId)
			.order('sort_order'),
		locals.supabase.from('personnel_trainings').select('*').eq('organization_id', orgId)
	]);

	// Transform personnel data
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

	// Transform groups data
	const groups: Group[] = (groupsRes.data ?? []).map((g: any) => ({
		id: g.id,
		name: g.name,
		sortOrder: g.sort_order
	}));

	// Transform training types
	const trainingTypes: TrainingType[] = (trainingTypesRes.data ?? []).map((t: any) => ({
		id: t.id,
		name: t.name,
		description: t.description,
		expirationMonths: t.expiration_months,
		warningDaysYellow: t.warning_days_yellow,
		warningDaysOrange: t.warning_days_orange,
		requiredForRoles: t.required_for_roles ?? [],
		color: t.color,
		sortOrder: t.sort_order
	}));

	// Transform personnel trainings
	const personnelTrainings: PersonnelTraining[] = (personnelTrainingsRes.data ?? []).map(
		(t: any) => ({
			id: t.id,
			personnelId: t.personnel_id,
			trainingTypeId: t.training_type_id,
			completionDate: t.completion_date,
			expirationDate: t.expiration_date,
			notes: t.notes,
			certificateUrl: t.certificate_url
		})
	);

	// Extract unique clinic roles for the role selector
	const availableRoles = [...new Set(personnel.map((p) => p.clinicRole))].filter(Boolean).sort();

	return {
		orgId,
		personnel,
		groups,
		trainingTypes,
		personnelTrainings,
		availableRoles
	};
};
