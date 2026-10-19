export interface CounselingRecordRow {
	id: string;
	personnel_id: string;
	date_conducted: string;
	title?: string | null;
	subject?: string | null;
	summary?: string | null;
	notes?: string | null;
	uploaded_by?: string | null;
	file_path: string | null;
	created_at?: string | null;
	archived_at?: string | null;
	archived_by?: string | null;
}

export interface PersonnelDocumentRow {
	id: string;
	personnel_id: string;
	title: string;
	file_path: string;
	file_size_bytes: number;
	content_type: string;
	uploaded_by: string;
	created_at?: string | null;
	archived_at?: string | null;
	archived_by?: string | null;
}

export interface FollowUpRow {
	id: string;
	personnel_id: string;
	title: string;
	notes: string | null;
	due_date: string | null;
	status: 'open' | 'completed' | 'archived';
	created_by: string;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
	completed_by?: string | null;
	archived_at?: string | null;
	archived_by?: string | null;
}

export interface LeaderNoteRow {
	id: string;
	personnel_id: string;
	author: string;
	text: string;
	created_at: string;
	updated_at?: string;
	archived_at?: string | null;
	archived_by?: string | null;
}

export interface PersonnelRecordCounts {
	openFollowUps: number;
	archived: number;
}

export interface PersonnelArtifactReadPersistence {
	countRecords(personnelId: string): Promise<PersonnelRecordCounts>;
	listCounselingRecords(
		personnelId: string,
		options: { archived: boolean; limit?: number }
	): Promise<CounselingRecordRow[]>;
	listDocuments(personnelId: string, options: { archived: boolean; limit?: number }): Promise<PersonnelDocumentRow[]>;
	listFollowUps(personnelId: string, options: { archived: boolean; limit?: number }): Promise<FollowUpRow[]>;
	findDocument(personnelId: string, documentId: string): Promise<PersonnelDocumentRow | null>;
	listLeaderNotePage(
		personnelId: string,
		options: { archived: boolean; limit: number; before?: { createdAt: string; id: string } }
	): Promise<LeaderNoteRow[]>;
	countActiveLeaderNotes(personnelId: string): Promise<number>;
}
export interface CounselingCreate {
	dateConducted: string;
	title: string;
	summary: string | null;
	uploadedBy: string;
	filePath: string;
	createdAt: string;
}
export interface DocumentCreate {
	title: string;
	filePath: string;
	fileSizeBytes: number;
	contentType: string;
	uploadedBy: string;
	createdAt: string;
}
export interface FollowUpCreate {
	title: string;
	notes: string | null;
	dueDate: string | null;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
}
/** When and by whom an artifact was completed or archived; `null` clears both. */
export interface ActorStamp {
	at: string;
	by: string;
}

export interface FollowUpPatch {
	title?: string;
	notes?: string | null;
	dueDate?: string | null;
	status?: 'open' | 'completed' | 'archived';
	completed?: ActorStamp | null;
	archived?: ActorStamp | null;
	updatedAt: string;
}
export interface LeaderNoteCreate {
	author: string;
	text: string;
	createdAt: string;
}
