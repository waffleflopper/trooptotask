import { z } from 'zod';
import type { PersonnelFollowUp } from '$features/personnel/personnel-detail.types';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import { requirePersonnelArtifactAccess } from './personnelArtifactAuthorization';
import { loadPersonnelContributorLabels, resolveContributorLabel } from './personnelContributorLabels';

interface FollowUpRow {
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
}

export const personnelFollowUpInputSchema = z.object({
	personnelId: z.string().min(1),
	title: z.string().trim().min(1, 'Follow-up title is required').max(200),
	notes: z.string().trim().max(2000).optional().default(''),
	dueDate: z.string().date().nullable().optional().default(null)
});

export const personnelFollowUpStatusSchema = z.object({
	personnelId: z.string().min(1),
	followUpId: z.string().min(1),
	status: z.enum(['open', 'completed', 'archived'])
});

export const personnelFollowUpUpdateSchema = z.object({
	personnelId: z.string().min(1),
	followUpId: z.string().min(1),
	title: z.string().trim().min(1, 'Follow-up title is required').max(200),
	notes: z.string().trim().max(2000).optional().default(''),
	dueDate: z.string().date().nullable().optional().default(null)
});

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
		completedAt: row.completed_at
	};
}

function requireUserId(ctx: UseCaseContext): string {
	if (!ctx.auth.userId) fail(401, 'Authenticated user required');
	return ctx.auth.userId;
}

export async function listPersonnelFollowUps(
	ctx: UseCaseContext,
	personnelId: string,
	limit?: number,
	options: { archived?: boolean } = {}
): Promise<PersonnelFollowUp[]> {
	await requirePersonnelArtifactAccess(ctx, personnelId);

	const rows = await ctx.store.findMany<FollowUpRow>(
		'personnel_follow_ups',
		ctx.auth.orgId,
		{ personnel_id: personnelId },
		{
			// Open sorts after completed lexicographically, so descending keeps active work first while archived is excluded.
			orderBy: [
				{ column: 'status', ascending: false },
				{ column: 'created_at', ascending: false }
			],
			...(options.archived ? { filters: { status: 'archived' } } : { notInFilters: { status: ['archived'] } }),
			limit
		}
	);

	const labels = await loadPersonnelContributorLabels(
		ctx,
		rows.map((row) => row.created_by)
	);
	return rows.map((row) => mapFollowUpRow(row, labels));
}

export async function createPersonnelFollowUp(ctx: UseCaseContext, rawInput: unknown): Promise<PersonnelFollowUp> {
	const parsed = personnelFollowUpInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}

	const input = parsed.data;
	await requirePersonnelArtifactAccess(ctx, input.personnelId);
	const now = new Date().toISOString();

	const row = await ctx.store.insert<FollowUpRow>('personnel_follow_ups', ctx.auth.orgId, {
		personnel_id: input.personnelId,
		title: input.title,
		notes: input.notes,
		due_date: input.dueDate,
		status: 'open',
		created_by: requireUserId(ctx),
		created_at: now,
		updated_at: now
	});

	ctx.audit.log({
		action: 'personnel.follow_up.created',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});

	const labels = await loadPersonnelContributorLabels(ctx, [row.created_by]);
	return mapFollowUpRow(row, labels);
}

export async function setPersonnelFollowUpStatus(ctx: UseCaseContext, rawInput: unknown): Promise<PersonnelFollowUp> {
	const parsed = personnelFollowUpStatusSchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}

	const input = parsed.data;
	await requirePersonnelArtifactAccess(ctx, input.personnelId);

	const current = await ctx.store.findOne<FollowUpRow>('personnel_follow_ups', ctx.auth.orgId, {
		id: input.followUpId,
		personnel_id: input.personnelId
	});
	if (!current) fail(404, 'Follow-up not found');
	if (current.status === 'archived' && input.status !== 'archived') {
		fail(409, 'Archived follow-ups cannot be reopened');
	}

	const now = new Date().toISOString();
	const row = await ctx.store.update<FollowUpRow>('personnel_follow_ups', ctx.auth.orgId, input.followUpId, {
		status: input.status,
		completed_at: input.status === 'completed' ? now : null,
		updated_at: now
	});

	ctx.audit.log({
		action: `personnel.follow_up.${input.status === 'completed' ? 'completed' : input.status === 'archived' ? 'archived' : 'reopened'}`,
		resourceType: 'personnel',
		resourceId: input.personnelId
	});

	const labels = await loadPersonnelContributorLabels(ctx, [row.created_by]);
	return mapFollowUpRow(row, labels);
}

export async function updatePersonnelFollowUp(ctx: UseCaseContext, rawInput: unknown): Promise<PersonnelFollowUp> {
	const parsed = personnelFollowUpUpdateSchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}

	const input = parsed.data;
	await requirePersonnelArtifactAccess(ctx, input.personnelId);

	const current = await ctx.store.findOne<FollowUpRow>('personnel_follow_ups', ctx.auth.orgId, {
		id: input.followUpId,
		personnel_id: input.personnelId
	});
	if (!current) fail(404, 'Follow-up not found');
	if (current.status === 'archived') {
		fail(409, 'Archived follow-ups cannot be edited');
	}

	const row = await ctx.store.update<FollowUpRow>('personnel_follow_ups', ctx.auth.orgId, input.followUpId, {
		title: input.title,
		notes: input.notes,
		due_date: input.dueDate,
		updated_at: new Date().toISOString()
	});

	ctx.audit.log({
		action: 'personnel.follow_up.updated',
		resourceType: 'personnel',
		resourceId: input.personnelId
	});

	const labels = await loadPersonnelContributorLabels(ctx, [row.created_by]);
	return mapFollowUpRow(row, labels);
}

export async function archivePersonnelFollowUp(ctx: UseCaseContext, rawInput: unknown): Promise<PersonnelFollowUp> {
	return setPersonnelFollowUpStatus(ctx, {
		...(typeof rawInput === 'object' && rawInput !== null ? rawInput : {}),
		status: 'archived'
	});
}

export async function restorePersonnelFollowUp(ctx: UseCaseContext, rawInput: unknown): Promise<PersonnelFollowUp> {
	const parsed = personnelFollowUpStatusSchema.safeParse({
		...(typeof rawInput === 'object' && rawInput !== null ? rawInput : {}),
		status: 'open'
	});
	if (!parsed.success) {
		fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}

	const input = parsed.data;
	await requirePersonnelArtifactAccess(ctx, input.personnelId);
	const current = await ctx.store.findOne<FollowUpRow>('personnel_follow_ups', ctx.auth.orgId, {
		id: input.followUpId,
		personnel_id: input.personnelId
	});
	if (!current) fail(404, 'Follow-up not found');
	if (current.status !== 'archived') fail(409, 'Only archived follow-ups can be restored');

	const row = await ctx.store.update<FollowUpRow>('personnel_follow_ups', ctx.auth.orgId, input.followUpId, {
		status: 'open',
		completed_at: null,
		updated_at: new Date().toISOString()
	});
	ctx.audit.log({ action: 'personnel.follow_up.restored', resourceType: 'personnel', resourceId: input.personnelId });
	const labels = await loadPersonnelContributorLabels(ctx, [row.created_by]);
	return mapFollowUpRow(row, labels);
}

export async function deletePersonnelFollowUp(ctx: UseCaseContext, rawInput: unknown): Promise<void> {
	const parsed = personnelFollowUpStatusSchema.safeParse({
		...(typeof rawInput === 'object' && rawInput !== null ? rawInput : {}),
		status: 'archived'
	});
	if (!parsed.success) {
		fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}
	const input = parsed.data;
	await requirePersonnelArtifactAccess(ctx, input.personnelId);
	const current = await ctx.store.findOne<FollowUpRow>('personnel_follow_ups', ctx.auth.orgId, {
		id: input.followUpId,
		personnel_id: input.personnelId
	});
	if (!current) fail(404, 'Follow-up not found');
	if (current.status !== 'archived') fail(409, 'Archive follow-ups before deleting them');
	await ctx.store.delete('personnel_follow_ups', ctx.auth.orgId, input.followUpId);
	ctx.audit.log({ action: 'personnel.follow_up.deleted', resourceType: 'personnel', resourceId: input.personnelId });
}
