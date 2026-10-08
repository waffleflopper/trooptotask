import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	PersonnelSheetEditableValues,
	SavedPersonnelSheet,
	PersonnelSheetPersistence,
	PersonnelWorkbookHistoryReader,
	PersonnelCounselingExportFacts,
	PersonnelSheetExportFacts
} from './personnelSheetPersistence';
const SELECT =
	'id,personnel_id,organization_id,blood_type,basd,date_of_rank,marital_status,number_of_dependents,children,civilian_education,military_education,emergency_contact_name,emergency_contact_relationship,emergency_contact_phone,spouse_name,spouse_phone,vehicle_make_model,vehicle_plate,vehicle_color,personal_email,personal_phone,address_street,address_city,address_state,address_zip,award_tracking_acknowledged_at,created_at,updated_at';
function saved(row: SavedPersonnelSheet): SavedPersonnelSheet {
	return {
		id: row.id,
		personnel_id: row.personnel_id,
		...(row.organization_id !== undefined ? { organization_id: row.organization_id } : {}),
		...(row.blood_type !== undefined ? { blood_type: row.blood_type } : {}),
		...(row.basd !== undefined ? { basd: row.basd } : {}),
		...(row.date_of_rank !== undefined ? { date_of_rank: row.date_of_rank } : {}),
		...(row.marital_status !== undefined ? { marital_status: row.marital_status } : {}),
		...(row.number_of_dependents !== undefined ? { number_of_dependents: row.number_of_dependents } : {}),
		...(row.children !== undefined ? { children: row.children } : {}),
		...(row.civilian_education !== undefined ? { civilian_education: row.civilian_education } : {}),
		...(row.military_education !== undefined ? { military_education: row.military_education } : {}),
		...(row.emergency_contact_name !== undefined ? { emergency_contact_name: row.emergency_contact_name } : {}),
		...(row.emergency_contact_relationship !== undefined
			? { emergency_contact_relationship: row.emergency_contact_relationship }
			: {}),
		...(row.emergency_contact_phone !== undefined ? { emergency_contact_phone: row.emergency_contact_phone } : {}),
		...(row.spouse_name !== undefined ? { spouse_name: row.spouse_name } : {}),
		...(row.spouse_phone !== undefined ? { spouse_phone: row.spouse_phone } : {}),
		...(row.vehicle_make_model !== undefined ? { vehicle_make_model: row.vehicle_make_model } : {}),
		...(row.vehicle_plate !== undefined ? { vehicle_plate: row.vehicle_plate } : {}),
		...(row.vehicle_color !== undefined ? { vehicle_color: row.vehicle_color } : {}),
		...(row.personal_email !== undefined ? { personal_email: row.personal_email } : {}),
		...(row.personal_phone !== undefined ? { personal_phone: row.personal_phone } : {}),
		...(row.address_street !== undefined ? { address_street: row.address_street } : {}),
		...(row.address_city !== undefined ? { address_city: row.address_city } : {}),
		...(row.address_state !== undefined ? { address_state: row.address_state } : {}),
		...(row.address_zip !== undefined ? { address_zip: row.address_zip } : {}),
		...(row.award_tracking_acknowledged_at !== undefined
			? { award_tracking_acknowledged_at: row.award_tracking_acknowledged_at }
			: {}),
		...(row.created_at !== undefined ? { created_at: row.created_at } : {}),
		...(row.updated_at !== undefined ? { updated_at: row.updated_at } : {})
	};
}
function editable(input: PersonnelSheetEditableValues): PersonnelSheetEditableValues {
	return {
		blood_type: input.blood_type,
		basd: input.basd,
		date_of_rank: input.date_of_rank,
		marital_status: input.marital_status,
		number_of_dependents: input.number_of_dependents,
		children: input.children,
		civilian_education: input.civilian_education,
		military_education: input.military_education,
		emergency_contact_name: input.emergency_contact_name,
		emergency_contact_relationship: input.emergency_contact_relationship,
		emergency_contact_phone: input.emergency_contact_phone,
		spouse_name: input.spouse_name,
		spouse_phone: input.spouse_phone,
		vehicle_make_model: input.vehicle_make_model,
		vehicle_plate: input.vehicle_plate,
		vehicle_color: input.vehicle_color,
		personal_email: input.personal_email,
		personal_phone: input.personal_phone,
		address_street: input.address_street,
		address_city: input.address_city,
		address_state: input.address_state,
		address_zip: input.address_zip
	};
}
export function createSupabasePersonnelSheetPersistence(
	client: SupabaseClient,
	orgId: string
): PersonnelSheetPersistence {
	return {
		async listSheetsForPerson(personnelId) {
			const rows: SavedPersonnelSheet[] = [];
			for (let offset = 0; ; offset += 1000) {
				const { data, error } = await client
					.from('personnel_extended_info')
					.select(SELECT)
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId)
					.order('id', { ascending: true })
					.range(offset, offset + 999);
				if (error) throw new Error(error.message);
				const page = data ?? [];
				rows.push(...page.map(saved));
				if (page.length < 1000) return rows;
			}
		},
		async findSheetForPerson(personnelId) {
			const { data, error } = await client
				.from('personnel_extended_info')
				.select(SELECT)
				.eq('organization_id', orgId)
				.eq('personnel_id', personnelId)
				.single();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data ? saved(data) : null;
		},
		async createSheet(personnelId, input) {
			const values =
				'award_tracking_acknowledged_at' in input
					? { award_tracking_acknowledged_at: input.award_tracking_acknowledged_at }
					: editable(input);
			const { data, error } = await client
				.from('personnel_extended_info')
				.insert({ ...values, organization_id: orgId, personnel_id: personnelId })
				.select(SELECT)
				.single();
			if (error) throw new Error(error.message);
			return saved(data);
		},
		async replaceEditableSheetFields(id, input) {
			const { data, error } = await client
				.from('personnel_extended_info')
				.update(editable(input))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(SELECT)
				.single();
			if (error) throw new Error(error.message);
			return saved(data);
		},
		async setAwardAcknowledgedAt(id, value) {
			const { error } = await client
				.from('personnel_extended_info')
				.update({ award_tracking_acknowledged_at: value })
				.eq('organization_id', orgId)
				.eq('id', id);
			if (error) throw new Error(error.message);
		}
	};
}
export function createSupabasePersonnelWorkbookHistoryReader(
	client: SupabaseClient,
	orgId: string
): PersonnelWorkbookHistoryReader {
	return {
		async listCounselingExportFacts(personnelId) {
			const rows: PersonnelCounselingExportFacts[] = [];
			for (let offset = 0; ; offset += 1000) {
				const { data, error } = await client
					.from('counseling_records')
					.select('date_conducted,subject,key_points,plan_of_action,status,follow_up_date,notes')
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId)
					.order('date_conducted', { ascending: false })
					.order('id', { ascending: true })
					.range(offset, offset + 999);
				if (error) throw new Error(error.message);
				const page = data ?? [];
				rows.push(
					...page.map((row: PersonnelCounselingExportFacts) => ({
						...(row.date_conducted !== undefined ? { date_conducted: row.date_conducted } : {}),
						...(row.subject !== undefined ? { subject: row.subject } : {}),
						...(row.key_points !== undefined ? { key_points: row.key_points } : {}),
						...(row.plan_of_action !== undefined ? { plan_of_action: row.plan_of_action } : {}),
						...(row.status !== undefined ? { status: row.status } : {}),
						...(row.follow_up_date !== undefined ? { follow_up_date: row.follow_up_date } : {}),
						...(row.notes !== undefined ? { notes: row.notes } : {})
					}))
				);
				if (page.length < 1000) return rows;
			}
		},
		async listExtendedInfoExportFacts(personnelId) {
			const rows: PersonnelSheetExportFacts[] = [];
			for (let offset = 0; ; offset += 1000) {
				const { data, error } = await client
					.from('personnel_extended_info')
					.select(
						'emergency_contact_name,emergency_contact_relationship,emergency_contact_phone,spouse_name,spouse_phone,vehicle_make_model,vehicle_plate,vehicle_color,personal_email,personal_phone,address_street,address_city,address_state,address_zip'
					)
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId)
					.order('id', { ascending: true })
					.range(offset, offset + 999);
				if (error) throw new Error(error.message);
				const page = data ?? [];
				rows.push(
					...page.map((row: PersonnelSheetExportFacts) => ({
						...(row.emergency_contact_name !== undefined ? { emergency_contact_name: row.emergency_contact_name } : {}),
						...(row.emergency_contact_relationship !== undefined
							? { emergency_contact_relationship: row.emergency_contact_relationship }
							: {}),
						...(row.emergency_contact_phone !== undefined
							? { emergency_contact_phone: row.emergency_contact_phone }
							: {}),
						...(row.spouse_name !== undefined ? { spouse_name: row.spouse_name } : {}),
						...(row.spouse_phone !== undefined ? { spouse_phone: row.spouse_phone } : {}),
						...(row.vehicle_make_model !== undefined ? { vehicle_make_model: row.vehicle_make_model } : {}),
						...(row.vehicle_plate !== undefined ? { vehicle_plate: row.vehicle_plate } : {}),
						...(row.vehicle_color !== undefined ? { vehicle_color: row.vehicle_color } : {}),
						...(row.personal_email !== undefined ? { personal_email: row.personal_email } : {}),
						...(row.personal_phone !== undefined ? { personal_phone: row.personal_phone } : {}),
						...(row.address_street !== undefined ? { address_street: row.address_street } : {}),
						...(row.address_city !== undefined ? { address_city: row.address_city } : {}),
						...(row.address_state !== undefined ? { address_state: row.address_state } : {}),
						...(row.address_zip !== undefined ? { address_zip: row.address_zip } : {})
					}))
				);
				if (page.length < 1000) return rows;
			}
		}
	};
}
