import type { PageServerLoad } from './$types';
import type { Personnel } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type {
	PersonnelExtendedInfo,
	CounselingType,
	CounselingRecord,
	DevelopmentGoal
} from '$lib/types/leadersBook';
import { getSupabaseClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);

	// Load all data in parallel
	const [
		personnelRes,
		groupsRes,
		extendedInfoRes,
		counselingTypesRes,
		counselingRecordsRes,
		developmentGoalsRes
	] = await Promise.all([
		supabase
			.from('personnel')
			.select('*, groups(name)')
			.eq('organization_id', orgId)
			.order('last_name'),
		supabase.from('groups').select('*').eq('organization_id', orgId).order('sort_order'),
		supabase
			.from('personnel_extended_info')
			.select('*')
			.eq('organization_id', orgId),
		supabase
			.from('counseling_types')
			.select('*')
			.eq('organization_id', orgId)
			.order('sort_order'),
		supabase
			.from('counseling_records')
			.select('*')
			.eq('organization_id', orgId)
			.order('date_conducted', { ascending: false }),
		supabase
			.from('development_goals')
			.select('*')
			.eq('organization_id', orgId)
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

	// Transform extended info
	const extendedInfo: PersonnelExtendedInfo[] = (extendedInfoRes.data ?? []).map((e: any) => ({
		id: e.id,
		personnelId: e.personnel_id,
		emergencyContactName: e.emergency_contact_name,
		emergencyContactRelationship: e.emergency_contact_relationship,
		emergencyContactPhone: e.emergency_contact_phone,
		spouseName: e.spouse_name,
		spousePhone: e.spouse_phone,
		vehicleMakeModel: e.vehicle_make_model,
		vehiclePlate: e.vehicle_plate,
		vehicleColor: e.vehicle_color,
		personalEmail: e.personal_email,
		personalPhone: e.personal_phone,
		addressStreet: e.address_street,
		addressCity: e.address_city,
		addressState: e.address_state,
		addressZip: e.address_zip,
		leaderNotes: e.leader_notes
	}));

	// Transform counseling types
	const counselingTypes: CounselingType[] = (counselingTypesRes.data ?? []).map((t: any) => ({
		id: t.id,
		name: t.name,
		description: t.description,
		templateContent: t.template_content,
		recurrence: t.recurrence,
		color: t.color,
		isFreeform: t.is_freeform,
		sortOrder: t.sort_order
	}));

	// Transform counseling records
	const counselingRecords: CounselingRecord[] = (counselingRecordsRes.data ?? []).map(
		(r: any) => ({
			id: r.id,
			personnelId: r.personnel_id,
			counselingTypeId: r.counseling_type_id,
			dateConducted: r.date_conducted,
			subject: r.subject,
			keyPoints: r.key_points,
			planOfAction: r.plan_of_action,
			followUpDate: r.follow_up_date,
			status: r.status,
			counselorSigned: r.counselor_signed,
			counselorSignedAt: r.counselor_signed_at,
			soldierSigned: r.soldier_signed,
			soldierSignedAt: r.soldier_signed_at
		})
	);

	// Transform development goals
	const developmentGoals: DevelopmentGoal[] = (developmentGoalsRes.data ?? []).map((g: any) => ({
		id: g.id,
		personnelId: g.personnel_id,
		title: g.title,
		description: g.description,
		category: g.category,
		priority: g.priority,
		status: g.status,
		targetDate: g.target_date,
		progressNotes: g.progress_notes
	}));

	return {
		orgId,
		personnel,
		groups,
		extendedInfo,
		counselingTypes,
		counselingRecords,
		developmentGoals
	};
};
