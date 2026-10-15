import type { LeaderNoteRow } from './personnelArtifactPersistence';
export type { LeaderNoteRow } from './personnelArtifactPersistence';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import {
	personnelLeaderNoteInputSchema,
	type PersonnelArtifactArchiveState,
	type PersonnelLeaderNote
} from './contracts';
import { fail } from '$lib/errors';
import { issueMessage } from '$lib/utils/inputSchemas';

export interface LeaderNoteCursor {
	createdAt: string;
	id: string;
}

export interface LeaderNotePersistence {
	findPersonnelGroup(personnelId: string): Promise<string | null | undefined>;
	listPage(
		personnelId: string,
		options: { archived: boolean; limit: number; before?: LeaderNoteCursor }
	): Promise<LeaderNoteRow[]>;
	find(personnelId: string, noteId: string): Promise<LeaderNoteRow | null>;
	insert(input: { personnelId: string; author: string; text: string; createdAt: string }): Promise<LeaderNoteRow>;
	update(personnelId: string, noteId: string, archivedAt: string | null): Promise<LeaderNoteRow>;
	delete(personnelId: string, noteId: string): Promise<void>;
}

export interface LeaderNoteContext {
	actor: OrganizationAccessGrant;
	scope: { requireGroupAccess(personnelId: string): Promise<void> };
	audit: PolicyAuditSink;
	persistence: LeaderNotePersistence;
	contributorLabels(userIds: string[]): Promise<Map<string, string>>;
}

async function requireAccess(ctx: LeaderNoteContext, personnelId: string, access: 'read' | 'write'): Promise<void> {
	const groupId = await ctx.persistence.findPersonnelGroup(personnelId);
	if (groupId === undefined) fail(404, 'Personnel record not found');
	await requireFeaturePolicy(
		{ auth: ctx.actor, audit: ctx.audit },
		access === 'read'
			? POLICY_ACTION_CATALOG.personnel.readSensitiveRecords
			: POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResourceForGroup(groupId),
		'personnel',
		personnelId
	);
	await ctx.scope.requireGroupAccess(personnelId);
}

function mapLeaderNoteRow(row: LeaderNoteRow, labels: Map<string, string> = new Map()): PersonnelLeaderNote {
	return {
		id: row.id,
		personnelId: row.personnel_id,
		author: row.author ? (labels.get(row.author) ?? row.author) : 'Unknown leader',
		date: row.created_at.slice(0, 10),
		text: row.text,
		createdAt: row.created_at,
		archivedAt: row.archived_at ?? null
	};
}

async function mapRows(ctx: LeaderNoteContext, rows: LeaderNoteRow[]): Promise<PersonnelLeaderNote[]> {
	const labels = await ctx.contributorLabels(rows.map((row) => row.author));
	return rows.map((row) => mapLeaderNoteRow(row, labels));
}

export async function listPersonnelLeaderNotes(
	ctx: LeaderNoteContext,
	personnelId: string,
	limit?: number,
	options: { archived?: boolean } = {}
): Promise<PersonnelLeaderNote[]> {
	await requireAccess(ctx, personnelId, 'read');
	const notes: PersonnelLeaderNote[] = [];
	let before: LeaderNoteCursor | undefined;
	while (limit === undefined || notes.length < limit) {
		const pageSize = Math.min(100, limit === undefined ? 100 : limit - notes.length);
		const rows = await ctx.persistence.listPage(personnelId, {
			archived: !!options.archived,
			limit: pageSize,
			before
		});
		if (rows.length === 0) break;
		notes.push(...(await mapRows(ctx, rows)));
		if (rows.length < pageSize) break;
		const last = rows[rows.length - 1];
		// Preserve database timestamp precision; Date would discard microseconds.
		before = { createdAt: last.created_at, id: last.id };
	}
	return notes;
}

export async function createPersonnelLeaderNote(
	ctx: LeaderNoteContext,
	rawInput: unknown
): Promise<PersonnelLeaderNote> {
	const parsed = personnelLeaderNoteInputSchema.safeParse(rawInput);
	if (!parsed.success) fail(400, issueMessage(parsed.error));
	const input = parsed.data;
	await requireAccess(ctx, input.personnelId, 'write');
	const row = await ctx.persistence.insert({
		personnelId: input.personnelId,
		author: ctx.actor.userId,
		text: input.text,
		createdAt: new Date().toISOString()
	});
	ctx.audit.log({ action: 'personnel.leader_note.created', resourceType: 'personnel', resourceId: input.personnelId });
	return (await mapRows(ctx, [row]))[0];
}

async function loadNote(ctx: LeaderNoteContext, personnelId: string, noteId: string): Promise<LeaderNoteRow> {
	await requireAccess(ctx, personnelId, 'write');
	const row = await ctx.persistence.find(personnelId, noteId);
	if (!row) fail(404, 'Leader note not found');
	return row;
}

export async function archivePersonnelLeaderNote(
	ctx: LeaderNoteContext,
	input: { personnelId: string; noteId: string }
): Promise<PersonnelArtifactArchiveState> {
	const existing = await loadNote(ctx, input.personnelId, input.noteId);
	if (existing.archived_at) fail(409, 'Leader note is already archived');
	const row = await ctx.persistence.update(input.personnelId, input.noteId, new Date().toISOString());
	ctx.audit.log({ action: 'personnel.leader_note.archived', resourceType: 'personnel', resourceId: input.personnelId });
	return { id: row.id, archivedAt: row.archived_at ?? null };
}

export async function restorePersonnelLeaderNote(
	ctx: LeaderNoteContext,
	input: { personnelId: string; noteId: string }
): Promise<PersonnelArtifactArchiveState> {
	await loadNote(ctx, input.personnelId, input.noteId);
	const row = await ctx.persistence.update(input.personnelId, input.noteId, null);
	ctx.audit.log({ action: 'personnel.leader_note.restored', resourceType: 'personnel', resourceId: input.personnelId });
	return { id: row.id, archivedAt: row.archived_at ?? null };
}

export async function deletePersonnelLeaderNote(
	ctx: LeaderNoteContext,
	input: { personnelId: string; noteId: string }
): Promise<void> {
	const row = await loadNote(ctx, input.personnelId, input.noteId);
	if (!row.archived_at) fail(409, 'Archive leader notes before deleting them');
	await ctx.persistence.delete(input.personnelId, input.noteId);
	ctx.audit.log({ action: 'personnel.leader_note.deleted', resourceType: 'personnel', resourceId: input.personnelId });
}
