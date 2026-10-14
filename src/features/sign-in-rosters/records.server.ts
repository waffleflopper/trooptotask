import {
	buildSensitiveFilePath,
	sanitizeSensitiveFilename,
	SENSITIVE_FILE_BUCKET,
	validateSensitivePdfFile
} from '$lib/storage/sensitiveFiles';
import { prepareSignInRosterSnapshot, type SignInRosterSnapshotContext } from './snapshot.server';
import type { SignInRosterListInput, SignInRosterPersistence } from './rosterPersistence.server';
import type { SignInRosterScanPort, SignInRosterFileActor } from './contracts';
import { fail } from '$lib/errors';

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

interface RosterFileContext extends Pick<RosterContext, 'orgId' | 'audit'> {
	actor: SignInRosterFileActor;
	scans: SignInRosterScanPort;
}

interface CreateRosterContext extends RosterContext, SignInRosterSnapshotContext {
	userId: string;
}

export async function listSignInRosters(ctx: RosterContext, input: SignInRosterListInput) {
	const { data, count } = await ctx.persistence.list(input);
	return { rosters: data, total: count ?? 0 };
}

export async function createSignInRoster(ctx: CreateRosterContext, input: Record<string, unknown>) {
	if (!input.title || !(input.title as string).trim()) fail(400, 'Title is required');
	const snapshot = await prepareSignInRosterSnapshot(ctx, input);
	const row = await ctx.persistence.create({
		title: (input.title as string).trim(),
		rosterDate: input.rosterDate || null,
		blankDate: input.blankDate ?? false,
		separateByGroup: input.separateByGroup ?? false,
		sortBy: snapshot.sortBy,
		personnelSnapshot: snapshot.personnelSnapshot,
		personnelIds: snapshot.personnelIds,
		scopeGroupIds: snapshot.scopeGroupIds,
		filterConfig: snapshot.filterConfig,
		createdBy: ctx.userId
	});

	ctx.audit.log({
		action: 'sign_in_roster.created',
		resourceType: 'sign_in_roster',
		resourceId: row.id,
		details: { title: input.title }
	});
	return row;
}

export async function deleteSignInRoster(ctx: RosterFileContext, rosterId: string) {
	const { title, fileCleanup } = await ctx.scans.deleteRoster(ctx.actor, rosterId);
	ctx.audit.log({
		action: 'sign_in_roster.deleted',
		resourceType: 'sign_in_roster',
		resourceId: rosterId,
		details: { title }
	});
	return { success: true, fileCleanup };
}

export async function getSignedScanUrl(ctx: RosterContext, rosterId: string) {
	const roster = await ctx.persistence.find(rosterId);
	if (!roster?.signedFilePath) fail(404, 'No signed file found');
	return { url: await ctx.storage.createSignedUrl(SENSITIVE_FILE_BUCKET, roster.signedFilePath, 300) };
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

	const filePath = buildScanPath(ctx.orgId.toLowerCase(), rosterId.toLowerCase(), file.name);
	await ctx.scans.replace(ctx.actor, rosterId, filePath, file);
	ctx.audit.log({
		action: 'sign_in_roster.scan_uploaded',
		resourceType: 'sign_in_roster',
		resourceId: rosterId
	});
	return { filePath };
}

export async function removeSignedScan(ctx: RosterFileContext, rosterId: string, expectedPath: string) {
	return { success: true, fileCleanup: await ctx.scans.remove(ctx.actor, rosterId, expectedPath) };
}
