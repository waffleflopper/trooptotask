import type { PageServerLoad } from './$types';
import type {
	PersonnelExtendedInfo,
	CounselingType,
	CounselingRecord,
	DevelopmentGoal
} from '$features/counseling/counseling.types';
import { getSupabaseClient } from '$lib/server/supabase';
import { formatDate } from '$lib/utils/dates';
import { transformAvailabilityEntries } from '$lib/server/transforms';

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);

	// Fetch ±1 day to cover timezone differences (server is UTC, client may not be)
	const yesterday = formatDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

	const [extendedInfoRes, counselingTypesRes, counselingRecordsRes, developmentGoalsRes, availabilityRes] =
		await Promise.all([
			supabase.from('personnel_extended_info').select('*').eq('organization_id', orgId),
			supabase.from('counseling_types').select('*').eq('organization_id', orgId).order('sort_order'),
			supabase
				.from('counseling_records')
				.select('*')
				.eq('organization_id', orgId)
				.order('date_conducted', { ascending: false }),
			supabase.from('development_goals').select('*').eq('organization_id', orgId),
			supabase.from('availability_entries').select('*').eq('organization_id', orgId).gte('end_date', yesterday)
		]);

	let extendedInfo: PersonnelExtendedInfo[] = (extendedInfoRes.data ?? []).map((e: Record<string, unknown>) => ({
		id: e.id as string,
		personnelId: e.personnel_id as string,
		emergencyContactName: e.emergency_contact_name as string | null,
		emergencyContactRelationship: e.emergency_contact_relationship as string | null,
		emergencyContactPhone: e.emergency_contact_phone as string | null,
		spouseName: e.spouse_name as string | null,
		spousePhone: e.spouse_phone as string | null,
		vehicleMakeModel: e.vehicle_make_model as string | null,
		vehiclePlate: e.vehicle_plate as string | null,
		vehicleColor: e.vehicle_color as string | null,
		personalEmail: e.personal_email as string | null,
		personalPhone: e.personal_phone as string | null,
		addressStreet: e.address_street as string | null,
		addressCity: e.address_city as string | null,
		addressState: e.address_state as string | null,
		addressZip: e.address_zip as string | null,
		leaderNotes: e.leader_notes as string | null
	}));

	const counselingTypes = (counselingTypesRes.data ?? []).map((t: Record<string, unknown>) => ({
		id: t.id as string,
		name: t.name as string,
		description: t.description as string | null,
		templateContent: t.template_content as string | null,
		templateFilePath: t.template_file_path as string | null,
		recurrence: t.recurrence as string,
		color: t.color as string,
		isFreeform: t.is_freeform as boolean,
		sortOrder: t.sort_order as number
	})) as CounselingType[];

	let counselingRecords = (counselingRecordsRes.data ?? []).map((r: Record<string, unknown>) => ({
		id: r.id as string,
		personnelId: r.personnel_id as string,
		counselingTypeId: r.counseling_type_id as string,
		dateConducted: r.date_conducted as string,
		subject: r.subject as string | null,
		keyPoints: r.key_points as string | null,
		planOfAction: r.plan_of_action as string | null,
		notes: r.notes as string | null,
		filePath: r.file_path as string | null,
		followUpDate: r.follow_up_date as string | null,
		status: r.status as string,
		counselorSigned: r.counselor_signed as boolean,
		counselorSignedAt: r.counselor_signed_at as string | null,
		soldierSigned: r.soldier_signed as boolean,
		soldierSignedAt: r.soldier_signed_at as string | null
	})) as CounselingRecord[];

	let developmentGoals = (developmentGoalsRes.data ?? []).map((g: Record<string, unknown>) => ({
		id: g.id as string,
		personnelId: g.personnel_id as string,
		title: g.title as string,
		description: g.description as string | null,
		category: g.category as string,
		priority: g.priority as string,
		status: g.status as string,
		targetDate: g.target_date as string | null,
		progressNotes: g.progress_notes as string | null
	})) as DevelopmentGoal[];

	let availability = transformAvailabilityEntries(availabilityRes.data ?? []);

	const { scopedGroupId, personnel } = await parent();

	// If group-scoped, filter to only personnel in scope
	if (scopedGroupId) {
		const scopedPersonnelIds = new Set(personnel.map((p) => p.id));
		extendedInfo = extendedInfo.filter((e) => scopedPersonnelIds.has(e.personnelId));
		counselingRecords = counselingRecords.filter((r) => scopedPersonnelIds.has(r.personnelId));
		developmentGoals = developmentGoals.filter((g) => scopedPersonnelIds.has(g.personnelId));
		availability = availability.filter((a) => scopedPersonnelIds.has(a.personnelId));
	}

	return {
		orgId,
		extendedInfo,
		counselingTypes,
		counselingRecords,
		developmentGoals,
		availability
	};
};
