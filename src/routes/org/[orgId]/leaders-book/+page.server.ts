import type { PageServerLoad } from './$types';
import type {
	PersonnelExtendedInfo,
	CounselingType,
	CounselingRecord,
	DevelopmentGoal
} from '$lib/types/leadersBook';
import { getSupabaseClient } from '$lib/server/supabase';
import { formatDate } from '$lib/utils/dates';
import { transformAvailabilityEntries } from '$lib/server/transforms';

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);

	// Date range for availability data (current/future status only)
	const today = formatDate(new Date());

	const [
		extendedInfoRes,
		counselingTypesRes,
		counselingRecordsRes,
		developmentGoalsRes,
		availabilityRes
	] = await Promise.all([
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
			.eq('organization_id', orgId),
		supabase
			.from('availability_entries')
			.select('*')
			.eq('organization_id', orgId)
			.gte('end_date', today)
	]);

	let extendedInfo: PersonnelExtendedInfo[] = (extendedInfoRes.data ?? []).map((e: any) => ({
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

	const counselingTypes: CounselingType[] = (counselingTypesRes.data ?? []).map((t: any) => ({
		id: t.id,
		name: t.name,
		description: t.description,
		templateContent: t.template_content,
		templateFilePath: t.template_file_path,
		recurrence: t.recurrence,
		color: t.color,
		isFreeform: t.is_freeform,
		sortOrder: t.sort_order
	}));

	let counselingRecords: CounselingRecord[] = (counselingRecordsRes.data ?? []).map(
		(r: any) => ({
			id: r.id,
			personnelId: r.personnel_id,
			counselingTypeId: r.counseling_type_id,
			dateConducted: r.date_conducted,
			subject: r.subject,
			keyPoints: r.key_points,
			planOfAction: r.plan_of_action,
			notes: r.notes,
			filePath: r.file_path,
			followUpDate: r.follow_up_date,
			status: r.status,
			counselorSigned: r.counselor_signed,
			counselorSignedAt: r.counselor_signed_at,
			soldierSigned: r.soldier_signed,
			soldierSignedAt: r.soldier_signed_at
		})
	);

	let developmentGoals: DevelopmentGoal[] = (developmentGoalsRes.data ?? []).map((g: any) => ({
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

	let availability = transformAvailabilityEntries(availabilityRes.data ?? []);

	const { scopedGroupId, personnel } = await parent();

	// If group-scoped, filter to only personnel in scope
	if (scopedGroupId) {
		const scopedPersonnelIds = new Set(personnel.map((p: any) => p.id));
		extendedInfo = extendedInfo.filter(e => scopedPersonnelIds.has(e.personnelId));
		counselingRecords = counselingRecords.filter(r => scopedPersonnelIds.has(r.personnelId));
		developmentGoals = developmentGoals.filter(g => scopedPersonnelIds.has(g.personnelId));
		availability = availability.filter(a => scopedPersonnelIds.has(a.personnelId));
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
