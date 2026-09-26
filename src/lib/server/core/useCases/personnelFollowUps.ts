import { z } from 'zod';
import type { PersonnelFollowUp } from '$features/personnel/personnel-detail.types';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import {
	deleteArtifact,
	listArtifacts,
	loadPersonnelContributorLabels,
	mapFollowUpRow,
	PERSONNEL_FOLLOW_UP_SPEC,
	personnelArtifactWriter,
	type FollowUpRow
} from './personnelArtifactLifecycle';

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

const personnelFollowUpIdentitySchema = personnelFollowUpStatusSchema.omit({ status: true });

export const personnelFollowUpUpdateSchema = z.object({
	personnelId: z.string().min(1),
	followUpId: z.string().min(1),
	title: z.string().trim().min(1, 'Follow-up title is required').max(200),
	notes: z.string().trim().max(2000).optional().default(''),
	dueDate: z.string().date().nullable().optional().default(null)
});

function requireUserId(ctx: UseCaseContext): string {
	return ctx.auth.userId;
}

export async function listPersonnelFollowUps(
	ctx: UseCaseContext,
	personnelId: string,
	limit?: number,
	options: { archived?: boolean } = {}
): Promise<PersonnelFollowUp[]> {
	return listArtifacts(ctx, PERSONNEL_FOLLOW_UP_SPEC, personnelId, { limit, archived: options.archived });
}

export async function createPersonnelFollowUp(ctx: UseCaseContext, rawInput: unknown): Promise<PersonnelFollowUp> {
	const parsed = personnelFollowUpInputSchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}

	const input = parsed.data;
	const writer = await personnelArtifactWriter(ctx, input.personnelId);
	const now = new Date().toISOString();

	const row = await writer.insert<FollowUpRow>('personnel_follow_ups', {
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
	const writer = await personnelArtifactWriter(ctx, input.personnelId);

	const current = await writer.find<FollowUpRow>('personnel_follow_ups', input.followUpId);
	if (!current) fail(404, 'Follow-up not found');
	if (current.status === 'archived' && input.status !== 'archived') {
		fail(409, 'Archived follow-ups cannot be reopened');
	}

	const now = new Date().toISOString();
	const row = await writer.update<FollowUpRow>('personnel_follow_ups', input.followUpId, {
		status: input.status,
		completed_at: input.status === 'completed' ? now : null,
		archived_at: input.status === 'archived' ? now : null,
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
	const writer = await personnelArtifactWriter(ctx, input.personnelId);

	const current = await writer.find<FollowUpRow>('personnel_follow_ups', input.followUpId);
	if (!current) fail(404, 'Follow-up not found');
	if (current.status === 'archived') {
		fail(409, 'Archived follow-ups cannot be edited');
	}

	const row = await writer.update<FollowUpRow>('personnel_follow_ups', input.followUpId, {
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
	const writer = await personnelArtifactWriter(ctx, input.personnelId);
	const current = await writer.find<FollowUpRow>('personnel_follow_ups', input.followUpId);
	if (!current) fail(404, 'Follow-up not found');
	if (current.status !== 'archived') fail(409, 'Only archived follow-ups can be restored');

	const row = await writer.update<FollowUpRow>('personnel_follow_ups', input.followUpId, {
		status: 'open',
		completed_at: null,
		archived_at: null,
		updated_at: new Date().toISOString()
	});
	ctx.audit.log({ action: 'personnel.follow_up.restored', resourceType: 'personnel', resourceId: input.personnelId });
	const labels = await loadPersonnelContributorLabels(ctx, [row.created_by]);
	return mapFollowUpRow(row, labels);
}

export async function deletePersonnelFollowUp(ctx: UseCaseContext, rawInput: unknown): Promise<void> {
	const parsed = personnelFollowUpIdentitySchema.safeParse(rawInput);
	if (!parsed.success) {
		fail(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	}
	const input = parsed.data;
	return deleteArtifact(ctx, PERSONNEL_FOLLOW_UP_SPEC, { personnelId: input.personnelId, id: input.followUpId });
}
