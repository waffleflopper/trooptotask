import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { personnelLeaderNoteInputSchema, type PersonnelLeaderNote } from './contracts';

export interface LeaderNoteRow {
	id: string;
	personnel_id: string;
	author: string;
	text: string;
	created_at: string;
	archived_at?: string | null;
}

export interface LeaderNotePersistence {
	findPersonnelGroup(personnelId: string): Promise<string | null | undefined>;
	list(personnelId: string, options: { archived: boolean; limit?: number }): Promise<LeaderNoteRow[]>;
	find(personnelId: string, noteId: string): Promise<LeaderNoteRow | null>;
	insert(input: { personnelId: string; author: string; text: string; createdAt: string }): Promise<LeaderNoteRow>;
	update(noteId: string, archivedAt: string | null): Promise<LeaderNoteRow>;
	delete(noteId: string): Promise<void>;
}

export interface LeaderNoteContext {
	actor: Parameters<typeof requireFeaturePolicy>[0]['auth'] & { userId: string; orgId: string };
	scope: { requireGroupAccess(personnelId: string): Promise<void> };
	audit: NonNullable<Parameters<typeof requireFeaturePolicy>[0]['audit']>;
	persistence: LeaderNotePersistence;
	contributorLabels(userIds: string[]): Promise<Map<string, string>>;
}

function fail(status: number, message: string): never {
	throw Object.assign(new Error(message), { status });
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

export function mapLeaderNoteRow(row: LeaderNoteRow, labels: Map<string, string> = new Map()): PersonnelLeaderNote {
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
	return mapRows(ctx, await ctx.persistence.list(personnelId, { archived: !!options.archived, limit }));
}

export async function createPersonnelLeaderNote(
	ctx: LeaderNoteContext,
	rawInput: unknown
): Promise<PersonnelLeaderNote> {
	const parsed = personnelLeaderNoteInputSchema.safeParse(rawInput);
	if (!parsed.success) fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
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
): Promise<PersonnelLeaderNote> {
	const existing = await loadNote(ctx, input.personnelId, input.noteId);
	if (existing.archived_at) fail(409, 'Leader note is already archived');
	const row = await ctx.persistence.update(input.noteId, new Date().toISOString());
	ctx.audit.log({ action: 'personnel.leader_note.archived', resourceType: 'personnel', resourceId: input.personnelId });
	return (await mapRows(ctx, [row]))[0];
}

export async function restorePersonnelLeaderNote(
	ctx: LeaderNoteContext,
	input: { personnelId: string; noteId: string }
): Promise<PersonnelLeaderNote> {
	await loadNote(ctx, input.personnelId, input.noteId);
	const row = await ctx.persistence.update(input.noteId, null);
	ctx.audit.log({ action: 'personnel.leader_note.restored', resourceType: 'personnel', resourceId: input.personnelId });
	return (await mapRows(ctx, [row]))[0];
}

export async function deletePersonnelLeaderNote(
	ctx: LeaderNoteContext,
	input: { personnelId: string; noteId: string }
): Promise<void> {
	const row = await loadNote(ctx, input.personnelId, input.noteId);
	if (!row.archived_at) fail(409, 'Archive leader notes before deleting them');
	await ctx.persistence.delete(input.noteId);
	ctx.audit.log({ action: 'personnel.leader_note.deleted', resourceType: 'personnel', resourceId: input.personnelId });
}
