import type { SupabaseClient } from '$lib/server/database';
import type {
	PersonnelArtifactReadPersistence,
	CounselingRecordRow,
	PersonnelDocumentRow,
	FollowUpRow
} from './personnelArtifactPersistence';
import { counselingRow, documentRow, followUpRow, leaderNoteRow } from './personnelArtifactRow.server';
const COUNSELINGRECORDROW_SELECT =
	'id,personnel_id,date_conducted,title,subject,summary,notes,uploaded_by,conducted_by,file_path,created_at,archived_at,archived_by';
const PERSONNELDOCUMENTROW_SELECT =
	'id,personnel_id,title,file_path,file_size_bytes,content_type,uploaded_by,created_at,archived_at,archived_by';
const FOLLOWUPROW_SELECT =
	'id,personnel_id,title,notes,due_date,status,created_by,created_at,updated_at,completed_at,completed_by,archived_at,archived_by';
const LEADERNOTEROW_SELECT = 'id,personnel_id,author,text,created_at,updated_at,archived_at,archived_by';
export function createSupabasePersonnelArtifactReadPersistence(
	client: SupabaseClient,
	orgId: string
): PersonnelArtifactReadPersistence {
	return {
		async countRecords(personnelId) {
			const rows = (table: string) =>
				client
					.from(table)
					.select('id', { count: 'exact', head: true })
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId);
			const counts = await Promise.all([
				rows('personnel_follow_ups').eq('status', 'open'),
				rows('personnel_follow_ups').eq('status', 'archived'),
				rows('counseling_records').not('archived_at', 'is', null),
				rows('personnel_documents').not('archived_at', 'is', null),
				rows('leader_notes').not('archived_at', 'is', null)
			]);
			const [openFollowUps, ...archived] = counts.map(({ count, error }) => {
				if (error) throw new Error(error.message);
				return count ?? 0;
			});
			return { openFollowUps, archived: archived.reduce((sum, count) => sum + count, 0) };
		},
		async listCounselingRecords(personnelId, { archived, limit, offset = 0, onOrBefore }) {
			const rows: CounselingRecordRow[] = [];
			if (limit === 0) return rows;
			for (let from = offset; ; from += 1000) {
				let query = client
					.from('counseling_records')
					.select(COUNSELINGRECORDROW_SELECT)
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId);
				query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
				if (onOrBefore) query = query.lte('date_conducted', onOrBefore);
				query = query.order('date_conducted', { ascending: false });
				query = query.order('created_at', { ascending: false });
				const to = limit === undefined ? from + 999 : Math.min(from + 999, offset + limit - 1);
				const { data, error } = await query.order('id', { ascending: true }).range(from, to);
				if (error) throw new Error(error.message);
				const page = data ?? [];
				rows.push(...page.map(counselingRow));
				if (page.length < to - from + 1 || (limit !== undefined && rows.length >= limit)) return rows;
			}
		},
		async countActiveCounselingRecords(personnelId) {
			const { count, error } = await client
				.from('counseling_records')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId)
				.eq('personnel_id', personnelId)
				.is('archived_at', null);
			if (error) throw new Error(error.message);
			return count ?? 0;
		},
		async listActiveCounselingDates(personnelId, since) {
			const dates: string[] = [];
			for (let from = 0; ; from += 1000) {
				const { data, error } = await client
					.from('counseling_records')
					.select('date_conducted')
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId)
					.is('archived_at', null)
					.gte('date_conducted', since)
					.order('id', { ascending: true })
					.range(from, from + 999);
				if (error) throw new Error(error.message);
				const page = data ?? [];
				dates.push(...page.map((row) => row.date_conducted as string));
				if (page.length < 1000) return dates;
			}
		},
		async findCounseling(personnelId, counselingId) {
			const { data, error } = await client
				.from('counseling_records')
				.select(COUNSELINGRECORDROW_SELECT)
				.eq('organization_id', orgId)
				.eq('personnel_id', personnelId)
				.eq('id', counselingId)
				.maybeSingle();
			if (error) throw new Error(error.message);
			return data ? counselingRow(data) : null;
		},
		async listDocuments(personnelId, { archived, limit, offset = 0 }) {
			const rows: PersonnelDocumentRow[] = [];
			if (limit === 0) return rows;
			for (let from = offset; ; from += 1000) {
				let query = client
					.from('personnel_documents')
					.select(PERSONNELDOCUMENTROW_SELECT)
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId);
				query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
				query = query.order('created_at', { ascending: false });
				const to = limit === undefined ? from + 999 : Math.min(from + 999, offset + limit - 1);
				const { data, error } = await query.order('id', { ascending: true }).range(from, to);
				if (error) throw new Error(error.message);
				const page = data ?? [];
				rows.push(...page.map(documentRow));
				if (page.length < to - from + 1 || (limit !== undefined && rows.length >= limit)) return rows;
			}
		},
		async summarizeActiveDocuments(personnelId) {
			let bytes = 0;
			let count = 0;
			for (let from = 0; ; from += 1000) {
				const { data, error } = await client
					.from('personnel_documents')
					.select('file_size_bytes')
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId)
					.is('archived_at', null)
					.order('id', { ascending: true })
					.range(from, from + 999);
				if (error) throw new Error(error.message);
				const page = data ?? [];
				for (const row of page) bytes += row.file_size_bytes ?? 0;
				count += page.length;
				if (page.length < 1000) return { count, bytes };
			}
		},
		async listFollowUps(personnelId, { archived, limit }) {
			const rows: FollowUpRow[] = [];
			if (limit === 0) return rows;
			for (let offset = 0; ; offset += 1000) {
				let query = client
					.from('personnel_follow_ups')
					.select(FOLLOWUPROW_SELECT)
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId);
				query = archived ? query.eq('status', 'archived') : query.not('status', 'in', '(archived)');
				query = query.order('status', { ascending: false });
				if (archived) query = query.order('archived_at', { ascending: false });
				query = query.order('created_at', { ascending: false });
				const to = limit === undefined ? offset + 999 : Math.min(offset + 999, limit - 1);
				const { data, error } = await query.order('id', { ascending: true }).range(offset, to);
				if (error) throw new Error(error.message);
				const page = data ?? [];
				rows.push(...page.map(followUpRow));
				if (page.length < to - offset + 1 || (limit !== undefined && rows.length >= limit)) return rows;
			}
		},
		async listOpenFollowUps(personnelId, limit) {
			const [page, total] = await Promise.all([
				client
					.from('personnel_follow_ups')
					.select(FOLLOWUPROW_SELECT)
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId)
					.eq('status', 'open')
					.order('due_date', { ascending: true, nullsFirst: false })
					.order('created_at', { ascending: true })
					.order('id', { ascending: true })
					.limit(limit),
				client
					.from('personnel_follow_ups')
					.select('id', { count: 'exact', head: true })
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId)
					.eq('status', 'open')
			]);
			if (page.error) throw new Error(page.error.message);
			if (total.error) throw new Error(total.error.message);
			return { rows: (page.data ?? []).map(followUpRow), total: total.count ?? 0 };
		},
		async findDocument(personnelId, documentId) {
			const { data, error } = await client
				.from('personnel_documents')
				.select(PERSONNELDOCUMENTROW_SELECT)
				.eq('organization_id', orgId)
				.eq('personnel_id', personnelId)
				.eq('id', documentId)
				.single();
			if (error?.code === 'PGRST116') return null;
			if (error) throw new Error(error.message);
			return data ? documentRow(data) : null;
		},
		async countActiveLeaderNotes(personnelId) {
			const { count, error } = await client
				.from('leader_notes')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId)
				.eq('personnel_id', personnelId)
				.is('archived_at', null);
			if (error) throw new Error(error.message);
			return count ?? 0;
		},
		async listLeaderNotePage(personnelId, { archived, limit, before }) {
			const base = () => {
				const query = client
					.from('leader_notes')
					.select(LEADERNOTEROW_SELECT)
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId)
					.order('created_at', { ascending: false })
					.order('id', { ascending: false });
				return archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
			};
			if (!before) {
				const { data, error } = await base().limit(limit);
				if (error) throw new Error(error.message);
				return (data ?? []).map(leaderNoteRow);
			}
			const { data: tied, error: tiedError } = await base()
				.eq('created_at', before.createdAt)
				.lt('id', before.id)
				.limit(limit);
			if (tiedError) throw new Error(tiedError.message);
			const same = tied ?? [];
			if (same.length === limit) return same.map(leaderNoteRow);
			const { data: older, error } = await base()
				.lt('created_at', before.createdAt)
				.limit(limit - same.length);
			if (error) throw new Error(error.message);
			return [...same, ...(older ?? [])].map(leaderNoteRow);
		}
	};
}
