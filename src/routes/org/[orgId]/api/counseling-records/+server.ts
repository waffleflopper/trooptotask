import { createCrudHandlers } from '$lib/server/crudFactory';
import type { CounselingRecord } from '$lib/types/leadersBook';

const handlers = createCrudHandlers<CounselingRecord>({
	table: 'counseling_records',
	permission: 'personnel',
	fields: {
		personnelId: 'personnel_id',
		counselingTypeId: 'counseling_type_id',
		dateConducted: 'date_conducted',
		keyPoints: 'key_points',
		planOfAction: 'plan_of_action',
		followUpDate: 'follow_up_date',
		counselorSigned: 'counselor_signed',
		counselorSignedAt: 'counselor_signed_at',
		soldierSigned: 'soldier_signed',
		soldierSignedAt: 'soldier_signed_at'
	},
	defaults: {
		counseling_type_id: null,
		key_points: null,
		plan_of_action: null,
		follow_up_date: null,
		status: 'draft',
		counselor_signed: false,
		counselor_signed_at: null,
		soldier_signed: false,
		soldier_signed_at: null
	}
});

export const { POST, PUT, DELETE } = handlers;
