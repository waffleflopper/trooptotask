import type {
	CounselingRecordRow,
	PersonnelDocumentRow,
	FollowUpRow,
	LeaderNoteRow
} from './personnelArtifactPersistence';
export const counselingRow = (row: CounselingRecordRow): CounselingRecordRow => ({
	id: row.id,
	personnel_id: row.personnel_id,
	date_conducted: row.date_conducted,
	...(row.title !== undefined ? { title: row.title } : {}),
	...(row.subject !== undefined ? { subject: row.subject } : {}),
	...(row.summary !== undefined ? { summary: row.summary } : {}),
	...(row.notes !== undefined ? { notes: row.notes } : {}),
	...(row.uploaded_by !== undefined ? { uploaded_by: row.uploaded_by } : {}),
	...(row.conducted_by !== undefined ? { conducted_by: row.conducted_by } : {}),
	file_path: row.file_path,
	...(row.created_at !== undefined ? { created_at: row.created_at } : {}),
	...(row.archived_at !== undefined ? { archived_at: row.archived_at } : {}),
	...(row.archived_by !== undefined ? { archived_by: row.archived_by } : {})
});
export const documentRow = (row: PersonnelDocumentRow): PersonnelDocumentRow => ({
	id: row.id,
	personnel_id: row.personnel_id,
	title: row.title,
	file_path: row.file_path,
	file_size_bytes: row.file_size_bytes,
	content_type: row.content_type,
	uploaded_by: row.uploaded_by,
	...(row.created_at !== undefined ? { created_at: row.created_at } : {}),
	...(row.archived_at !== undefined ? { archived_at: row.archived_at } : {}),
	...(row.archived_by !== undefined ? { archived_by: row.archived_by } : {})
});
export const followUpRow = (row: FollowUpRow): FollowUpRow => ({
	id: row.id,
	personnel_id: row.personnel_id,
	title: row.title,
	notes: row.notes,
	due_date: row.due_date,
	status: row.status,
	created_by: row.created_by,
	created_at: row.created_at,
	updated_at: row.updated_at,
	completed_at: row.completed_at,
	...(row.completed_by !== undefined ? { completed_by: row.completed_by } : {}),
	...(row.archived_at !== undefined ? { archived_at: row.archived_at } : {}),
	...(row.archived_by !== undefined ? { archived_by: row.archived_by } : {})
});
export const leaderNoteRow = (row: LeaderNoteRow): LeaderNoteRow => ({
	id: row.id,
	personnel_id: row.personnel_id,
	author: row.author,
	text: row.text,
	created_at: row.created_at,
	...(row.updated_at !== undefined ? { updated_at: row.updated_at } : {}),
	...(row.archived_at !== undefined ? { archived_at: row.archived_at } : {}),
	...(row.archived_by !== undefined ? { archived_by: row.archived_by } : {})
});
