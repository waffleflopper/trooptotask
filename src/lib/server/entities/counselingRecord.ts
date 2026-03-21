import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';

export interface CounselingRecord {
	id: string;
	personnelId: string;
	dateConducted: string;
	subject: string;
	notes: string | null;
	filePath: string | null;
}

export const CounselingRecordEntity = defineEntity<CounselingRecord>({
	table: 'counseling_records',
	groupScope: { personnelColumn: 'personnel_id' },
	schema: {
		id: field(z.string(), { readOnly: true }),
		personnelId: field(z.string(), { column: 'personnel_id', isPersonnelId: true }),
		dateConducted: field(z.string(), { column: 'date_conducted' }),
		subject: field(z.string()),
		notes: field(z.string().nullable().optional(), { insertDefault: null }),
		filePath: field(z.string().nullable().optional(), { column: 'file_path', insertDefault: null })
	}
});
