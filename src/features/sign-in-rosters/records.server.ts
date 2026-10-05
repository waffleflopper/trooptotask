import { sanitizeErrorForLog } from '$lib/utils/logSanitize';
import {
	buildSensitiveFilePath,
	sanitizeSensitiveFilename,
	SENSITIVE_FILE_BUCKET,
	validateSensitivePdfFile
} from '$lib/storage/sensitiveFiles';
import { prepareSignInRosterSnapshot, type SignInRosterSnapshotContext } from './snapshot.server';
import type { SignInRosterListInput, SignInRosterPersistence, SignInRosterRecord } from './rosterPersistence.server';
import type { SignInRosterFileWritePort, SignInRosterFileActor } from './contracts';

interface RosterContext {
	orgId: string;
	persistence: SignInRosterPersistence;
	storage: {
		createSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string>;
	};
	audit: {
		log(event: { action: string; resourceType: string; resourceId: string; details?: Record<string, unknown> }): void;
	};
}

interface RosterFileContext extends Pick<RosterContext, 'orgId' | 'persistence' | 'audit'> {
	actor: SignInRosterFileActor;
	fileWrites: SignInRosterFileWritePort;
}

interface CreateRosterContext extends RosterContext, SignInRosterSnapshotContext {
	userId: string;
}

function fail(status: number, message: string): never {
	throw Object.assign(new Error(message), { status });
}

function toClient(row: SignInRosterRecord) {
	return {
		id: row.id,
		title: row.title,
		rosterDate: row.roster_date,
		blankDate: row.blank_date,
		separateByGroup: row.separate_by_group,
		sortBy: row.sort_by,
		personnelSnapshot: row.personnel_snapshot,
		filterConfig: row.filter_config,
		signedFilePath: row.signed_file_path,
		createdBy: row.created_by,
		createdAt: row.created_at
	};
}

export async function listSignInRosters(ctx: RosterContext, input: SignInRosterListInput) {
	const { data, count } = await ctx.persistence.list(input);
	return { rosters: data.map(toClient), total: count ?? 0 };
}

export async function createSignInRoster(ctx: CreateRosterContext, input: Record<string, unknown>) {
	if (!input.title || !(input.title as string).trim()) fail(400, 'Title is required');
	const snapshot = await prepareSignInRosterSnapshot(ctx, input);
	const row = await ctx.persistence.create({
		title: (input.title as string).trim(),
		roster_date: input.rosterDate || null,
		blank_date: input.blankDate ?? false,
		separate_by_group: input.separateByGroup ?? false,
		sort_by: snapshot.sortBy,
		personnel_snapshot: snapshot.personnelSnapshot,
		personnel_ids: snapshot.personnelIds,
		scope_group_ids: snapshot.scopeGroupIds,
		filter_config: snapshot.filterConfig,
		signed_file_path: null,
		created_by: ctx.userId
	});

	ctx.audit.log({
		action: 'sign_in_roster.created',
		resourceType: 'sign_in_roster',
		resourceId: row.id as string,
		details: { title: input.title }
	});
	return toClient(row);
}

export async function deleteSignInRoster(ctx: RosterFileContext, rosterId: string) {
	const roster = await ctx.persistence.find(rosterId);
	if (!roster) fail(404, 'Roster not found');
	if (roster.signed_file_path) {
		const files = await ctx.fileWrites.forRoster(ctx.actor, rosterId);
		await files.removePrevious(roster.signed_file_path);
	}
	await ctx.persistence.delete(rosterId);
	ctx.audit.log({
		action: 'sign_in_roster.deleted',
		resourceType: 'sign_in_roster',
		resourceId: rosterId,
		details: { title: roster.title }
	});
	return { success: true };
}

export async function getSignedScanUrl(ctx: RosterContext, rosterId: string) {
	const roster = await ctx.persistence.find(rosterId);
	if (!roster?.signed_file_path) fail(404, 'No signed file found');
	return { url: await ctx.storage.createSignedUrl(SENSITIVE_FILE_BUCKET, roster.signed_file_path, 300) };
}

function buildScanPath(orgId: string, rosterId: string, filename: string): string {
	return buildSensitiveFilePath({
		orgId,
		scope: 'sign-in-rosters',
		recordId: rosterId,
		filename: `${crypto.randomUUID()}-${sanitizeSensitiveFilename(filename)}`
	});
}

export async function uploadSignedScan(ctx: RosterFileContext, rosterId: string, file: File | null) {
	if (!file) fail(400, 'No file provided');
	const validationError = await validateSensitivePdfFile(file);
	if (validationError) fail(400, validationError);

	const roster = await ctx.persistence.find(rosterId);
	if (!roster) fail(404, 'Roster not found');
	const previousSignedFilePath = roster.signed_file_path ?? null;
	const storagePath = buildScanPath(ctx.orgId, rosterId, file.name);

	const files = await ctx.fileWrites.forRoster(ctx.actor, rosterId);
	const upload = await files.upload(storagePath, file);
	try {
		await ctx.persistence.setSignedFilePath(rosterId, storagePath);
	} catch (error) {
		try {
			await files.remove(storagePath);
			await upload.complete();
		} catch (cleanupError) {
			console.error(
				'[sign-in-roster-scan-upload] Failed to clean up uploaded scan after DB update failure:',
				sanitizeErrorForLog(cleanupError)
			);
		}
		throw error;
	}

	if (previousSignedFilePath && previousSignedFilePath !== storagePath) {
		try {
			await files.removePrevious(previousSignedFilePath);
		} catch (cleanupError) {
			try {
				await ctx.persistence.setSignedFilePath(rosterId, previousSignedFilePath);
			} catch (rollbackError) {
				console.error(
					'[sign-in-roster-scan-upload] Failed to restore previous scan path after cleanup failure:',
					sanitizeErrorForLog(rollbackError)
				);
			}
			try {
				await files.remove(storagePath);
				await upload.complete();
			} catch (replacementCleanupError) {
				console.error(
					'[sign-in-roster-scan-upload] Failed to clean up replacement scan after previous cleanup failure:',
					sanitizeErrorForLog(replacementCleanupError)
				);
			}
			throw cleanupError;
		}
	}
	await upload.complete();

	ctx.audit.log({
		action: 'sign_in_roster.scan_uploaded',
		resourceType: 'sign_in_roster',
		resourceId: rosterId
	});
	return { filePath: storagePath };
}

export async function removeSignedScan(ctx: RosterFileContext, rosterId: string) {
	const roster = await ctx.persistence.find(rosterId);
	if (!roster) fail(404, 'Roster not found');
	if (roster.signed_file_path) {
		const files = await ctx.fileWrites.forRoster(ctx.actor, rosterId);
		await files.removePrevious(roster.signed_file_path);
	}
	await ctx.persistence.setSignedFilePath(rosterId, null);
	return { success: true };
}
