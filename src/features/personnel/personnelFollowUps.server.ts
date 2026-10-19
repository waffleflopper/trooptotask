import { z } from 'zod';
import type { PersonnelFollowUp, PersonnelFollowUpLifecycleState } from './contracts';
import { fail } from '$lib/errors';
import {
	canReadSensitivePersonnelArtifacts,
	optionalContributorLabel,
	personnelArtifactWriter,
	requirePersonnelArtifactAccess,
	resolveContributorLabel,
	type PersonnelArtifactsContext,
	type FollowUpRow
} from './personnelArtifactContext.server';
import { issueMessage } from '$lib/utils/inputSchemas';

const personnelFollowUpInputSchema = z.object({
	personnelId: z.string().min(1),
	title: z.string().trim().min(1, 'Follow-up title is required').max(200),
	notes: z.string().trim().max(2000).optional().default(''),
	dueDate: z.string().date().nullable().optional().default(null)
});

const personnelFollowUpStatusSchema = z.object({
	personnelId: z.string().min(1),
	followUpId: z.string().min(1),
	status: z.enum(['open', 'completed', 'archived'])
});

const personnelFollowUpIdentitySchema = personnelFollowUpStatusSchema.omit({ status: true });

const personnelFollowUpUpdateSchema = z.object({
	personnelId: z.string().min(1),
	followUpId: z.string().min(1),
	title: z.string().trim().min(1, 'Follow-up title is required').max(200),
	notes: z.string().trim().max(2000).optional().default(''),
	dueDate: z.string().date().nullable().optional().default(null)
});

export async function listPersonnelFollowUps(
	ctx: PersonnelArtifactsContext,
	personnelId: string,
	limit?: number,
	options: { archived?: boolean } = {}
): Promise<PersonnelFollowUp[]> {
	await requirePersonnelArtifactAccess(ctx, personnelId, 'read');
	const rows = await ctx.persistence.listFollowUps(personnelId, { archived: !!options.archived, limit });
	const labels = await ctx.contributorLabels(followUpMemberIds(rows));
	return rows.map((row) => mapFollowUpRow(row, labels));
}

function followUpMemberIds(rows: FollowUpRow[]): string[] {
	return rows.flatMap((row) => [row.created_by, row.completed_by, row.archived_by].filter((id): id is string => !!id));
}

export async function createPersonnelFollowUp(
	ctx: PersonnelArtifactsContext,
	rawInput: unknown
): Promise<PersonnelFollowUp> {
	const parsed = personnelFollowUpInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, issueMessage(parsed.error));
	}

	const input = parsed.data;
	const writer = await personnelArtifactWriter(ctx, input.personnelId);
	const now = new Date().toISOString();

	const row = await writer.createFollowUp({
		title: input.title,
		notes: input.notes,
		dueDate: input.dueDate,
		createdBy: ctx.actor.userId,
		createdAt: now,
		updatedAt: now
	});

	ctx.audit.log({
		action: 'personnel.follow_up.created',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});

	const labels = await ctx.contributorLabels(followUpMemberIds([row]));
	return mapFollowUpRow(row, labels);
}

async function followUpLifecycleResult(
	ctx: PersonnelArtifactsContext,
	personnelId: string,
	row: FollowUpRow
): Promise<PersonnelFollowUp | PersonnelFollowUpLifecycleState> {
	if (!(await canReadSensitivePersonnelArtifacts(ctx, personnelId))) {
		return { id: row.id, status: row.status, archivedAt: row.archived_at ?? null };
	}
	return mapFollowUpRow(row, await ctx.contributorLabels(followUpMemberIds([row])));
}

export async function setPersonnelFollowUpStatus(
	ctx: PersonnelArtifactsContext,
	rawInput: unknown
): Promise<PersonnelFollowUp | PersonnelFollowUpLifecycleState> {
	const parsed = personnelFollowUpStatusSchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, issueMessage(parsed.error));
	}

	const input = parsed.data;
	const writer = await personnelArtifactWriter(ctx, input.personnelId);

	const current = await writer.findFollowUp(input.followUpId);
	if (!current) fail(404, 'Follow-up not found');
	if (current.status === 'archived' && input.status !== 'archived') {
		fail(409, 'Archived follow-ups cannot be reopened');
	}

	const now = new Date().toISOString();
	const stamp = { at: now, by: ctx.actor.userId };
	// Archiving keeps the completion so a restore puts the follow-up back where it was.
	const row = await writer.patchFollowUp(input.followUpId, {
		status: input.status,
		...(input.status === 'archived' ? {} : { completed: input.status === 'completed' ? stamp : null }),
		archived: input.status === 'archived' ? stamp : null,
		updatedAt: now
	});

	ctx.audit.log({
		action: `personnel.follow_up.${input.status === 'completed' ? 'completed' : input.status === 'archived' ? 'archived' : 'reopened'}`,
		resourceType: 'personnel',
		resourceId: input.personnelId
	});

	return followUpLifecycleResult(ctx, input.personnelId, row);
}

export async function updatePersonnelFollowUp(
	ctx: PersonnelArtifactsContext,
	rawInput: unknown
): Promise<PersonnelFollowUp> {
	const parsed = personnelFollowUpUpdateSchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, issueMessage(parsed.error));
	}

	const input = parsed.data;
	const writer = await personnelArtifactWriter(ctx, input.personnelId);

	const current = await writer.findFollowUp(input.followUpId);
	if (!current) fail(404, 'Follow-up not found');
	if (current.status === 'archived') {
		fail(409, 'Archived follow-ups cannot be edited');
	}

	const row = await writer.patchFollowUp(input.followUpId, {
		title: input.title,
		notes: input.notes,
		dueDate: input.dueDate,
		updatedAt: new Date().toISOString()
	});

	ctx.audit.log({
		action: 'personnel.follow_up.updated',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});

	const labels = await ctx.contributorLabels(followUpMemberIds([row]));
	return mapFollowUpRow(row, labels);
}

export async function archivePersonnelFollowUp(
	ctx: PersonnelArtifactsContext,
	rawInput: unknown
): Promise<PersonnelFollowUp | PersonnelFollowUpLifecycleState> {
	return setPersonnelFollowUpStatus(ctx, {
		...(typeof rawInput === 'object' && rawInput !== null ? rawInput : {}),
		status: 'archived'
	});
}

export async function restorePersonnelFollowUp(
	ctx: PersonnelArtifactsContext,
	rawInput: unknown
): Promise<PersonnelFollowUp | PersonnelFollowUpLifecycleState> {
	const parsed = personnelFollowUpStatusSchema.safeParse({
		...(typeof rawInput === 'object' && rawInput !== null ? rawInput : {}),
		status: 'open'
	});
	if (!parsed.success) {
		fail(400, issueMessage(parsed.error));
	}

	const input = parsed.data;
	const writer = await personnelArtifactWriter(ctx, input.personnelId);
	const current = await writer.findFollowUp(input.followUpId);
	if (!current) fail(404, 'Follow-up not found');
	if (current.status !== 'archived') fail(409, 'Only archived follow-ups can be restored');

	const row = await writer.patchFollowUp(input.followUpId, {
		status: current.completed_at ? 'completed' : 'open',
		archived: null,
		updatedAt: new Date().toISOString()
	});
	ctx.audit.log({ action: 'personnel.follow_up.restored', resourceType: 'personnel', resourceId: input.personnelId });
	return followUpLifecycleResult(ctx, input.personnelId, row);
}

export async function deletePersonnelFollowUp(ctx: PersonnelArtifactsContext, rawInput: unknown): Promise<void> {
	const parsed = personnelFollowUpIdentitySchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, issueMessage(parsed.error));
	}
	const input = parsed.data;
	const writer = await personnelArtifactWriter(ctx, input.personnelId);
	const row = await writer.findFollowUp(input.followUpId);
	if (!row) fail(404, 'Follow-up not found');
	if (row.status !== 'archived') fail(409, 'Archive follow-ups before deleting them');
	await writer.deleteFollowUp(input.followUpId);
	ctx.audit.log({ action: 'personnel.follow_up.deleted', resourceType: 'personnel', resourceId: input.personnelId });
}

function mapFollowUpRow(row: FollowUpRow, contributorLabels = new Map<string, string>()): PersonnelFollowUp {
	return {
		id: row.id,
		personnelId: row.personnel_id,
		title: row.title,
		notes: row.notes ?? '',
		dueDate: row.due_date,
		status: row.status,
		createdBy: resolveContributorLabel(contributorLabels, row.created_by),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		completedAt: row.completed_at,
		completedBy: optionalContributorLabel(contributorLabels, row.completed_by),
		archivedAt: row.archived_at ?? null,
		archivedBy: optionalContributorLabel(contributorLabels, row.archived_by)
	};
}
