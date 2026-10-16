import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { SENSITIVE_FILE_BUCKET } from '$lib/storage/sensitiveFiles';
import { validateUUID } from '$lib/server/validation';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';
import { registerOrganizationFileUpload, removeRetiredOrganizationFiles } from '$features/organization/index.server';
import type { FileCleanup, OrganizationFileUploadRegistration } from '$features/organization/contracts';
import { ROSTER_UNAVAILABLE_MESSAGE, type SignInRosterFileActor, type SignInRosterScanPort } from './contracts';
import { fail, RequestFailure } from '$lib/errors';

const SCAN_CHANGED_MESSAGE = 'This signed scan changed. Reload to review it.';
const SCAN_NOT_SAVED_MESSAGE = 'The signed scan change was not saved. Try again.';
const SCAN_UNCONFIRMED_MESSAGE = 'The signed scan change could not be confirmed. Reload to check it.';

interface RosterKeys {
	orgId: string;
	rosterId: string;
}

// SQL derives owned prefixes from uuid::text, which is lowercase whatever the route casing.
function rosterKeys(actor: SignInRosterFileActor, rosterId: string): RosterKeys {
	if (!validateUUID(rosterId)) fail(404, ROSTER_UNAVAILABLE_MESSAGE);
	return { orgId: actor.orgId.toLowerCase(), rosterId: rosterId.toLowerCase() };
}

function scanKeyOwned(keys: RosterKeys, path: unknown): path is string {
	const prefix = `${keys.orgId}/sign-in-rosters/${keys.rosterId}/`;
	return (
		typeof path === 'string' &&
		path.startsWith(prefix) &&
		path.length > prefix.length &&
		!path.split('/').some((part) => part === '.' || part === '..')
	);
}

function assertScanKey(keys: RosterKeys, path: string) {
	if (!scanKeyOwned(keys, path)) fail(400, 'Scan path is outside the authorized roster');
}

function commandFailure(error: PostgrestError): never {
	if (error.code === '42501') fail(403, error.message);
	if (error.code === 'P0002') fail(404, ROSTER_UNAVAILABLE_MESSAGE);
	if (error.code === '22023' || error.code === '22P02') fail(400, error.message);
	if (error.code === '55000') fail(409, error.message);
	if (error.code === '40P01' || error.code === '40001' || error.code === '55P03')
		fail(503, SCAN_NOT_SAVED_MESSAGE, { publicMessage: true });
	// supabase-js reports a lost or unreadable response without a database code.
	if (!error.code) fail(503, SCAN_UNCONFIRMED_MESSAGE, { publicMessage: true });
	throw new Error(error.message);
}

function onlyRow(data: unknown): Record<string, unknown> {
	const row: unknown = Array.isArray(data) && data.length === 1 ? data[0] : null;
	if (typeof row !== 'object' || row === null) throw new Error('Roster scan command was not acknowledged');
	return row as Record<string, unknown>;
}

function parseRetired(keys: RosterKeys, value: unknown, expected?: string): string | null {
	if (value === null) return null;
	if (scanKeyOwned(keys, value) && (expected === undefined || value === expected)) return value;
	throw new Error('Roster scan command was not acknowledged');
}

function logUnsettled(error: unknown) {
	console.error('[sign-in-roster-scan] Upload registration remains unsettled:', sanitizeErrorForLog(error));
}

export function createSupabaseSignInRosterScanPort(
	request: SupabaseClient,
	getAdminClient: () => SupabaseClient
): SignInRosterScanPort {
	const cleanUp = (retired: string | null): Promise<FileCleanup> =>
		retired
			? removeRetiredOrganizationFiles(getAdminClient(), [{ bucket_id: SENSITIVE_FILE_BUCKET, object_name: retired }])
			: Promise.resolve('complete');

	async function admitUpload(actor: SignInRosterFileActor, keys: RosterKeys) {
		const { data: roster, error } = await request
			.from('sign_in_rosters')
			.select('scope_group_ids,signed_file_path')
			.eq('organization_id', keys.orgId)
			.eq('id', keys.rosterId)
			.maybeSingle();
		if (error) throw new Error('Roster access could not be confirmed');
		if (!roster) fail(404, ROSTER_UNAVAILABLE_MESSAGE);
		if (!Array.isArray(roster.scope_group_ids) || roster.scope_group_ids.some((id) => typeof id !== 'string'))
			throw new Error('Roster Group scope could not be confirmed');
		for (const group of roster.scope_group_ids.length ? roster.scope_group_ids : [null]) {
			await requireFeaturePolicy(
				{ auth: actor },
				POLICY_ACTION_CATALOG.training.manageSignInRosters,
				policyResourceForGroup(group),
				'sign_in_roster',
				keys.rosterId
			);
		}
		if (roster.signed_file_path !== null && !scanKeyOwned(keys, roster.signed_file_path))
			fail(400, "This roster's signed scan uses an unsupported storage location");
	}

	async function uploadRegistered(
		admin: SupabaseClient,
		actor: SignInRosterFileActor,
		path: string,
		file: File
	): Promise<OrganizationFileUploadRegistration> {
		const registration = await registerOrganizationFileUpload(admin, {
			orgId: actor.orgId,
			userId: actor.userId,
			bucket: SENSITIVE_FILE_BUCKET,
			path
		});
		try {
			const current = await request.rpc('sensitive_file_object_is_writable', {
				bucket_name: SENSITIVE_FILE_BUCKET,
				object_name: path
			});
			if (current.error || current.data !== true)
				throw new RequestFailure(403, 'Current roster upload access is required');
		} catch (error) {
			await registration.complete();
			throw error;
		}
		const { data, error } = await admin.storage.from(SENSITIVE_FILE_BUCKET).upload(path, file, { upsert: false });
		if (error || data?.path !== path || data.fullPath !== `${SENSITIVE_FILE_BUCKET}/${path}`)
			throw new Error('Scan upload could not be confirmed');
		return registration;
	}

	async function settle(admin: SupabaseClient, keys: RosterKeys, path: string) {
		const { data, error } = await admin.rpc('settle_sign_in_roster_scan_upload', {
			p_organization_id: keys.orgId,
			p_roster_id: keys.rosterId,
			p_object_name: path
		});
		if (error) throw new Error(`Roster scan upload could not be settled: ${error.message}`);
		const row = onlyRow(data);
		if (row.attached === true && row.retired_object_name === null) return true;
		if (row.attached !== false) throw new Error('Roster scan upload settlement was not acknowledged');
		await cleanUp(parseRetired(keys, row.retired_object_name, path));
		return false;
	}

	return {
		async replace(actor, rosterId, path, file) {
			const keys = rosterKeys(actor, rosterId);
			assertScanKey(keys, path);
			if (!(file instanceof File)) fail(400, 'A scan file is required');
			await admitUpload(actor, keys);
			const admin = getAdminClient();
			const upload = await uploadRegistered(admin, actor, path, file);
			let displaced: string | null = null;
			try {
				const { data, error } = await request.rpc('attach_sign_in_roster_scan', {
					p_organization_id: keys.orgId,
					p_roster_id: keys.rosterId,
					p_object_name: path
				});
				if (error) commandFailure(error);
				displaced = parseRetired(keys, data);
			} catch (attachError) {
				let attached: boolean;
				try {
					attached = await settle(admin, keys, path);
				} catch (settleError) {
					logUnsettled(settleError);
					throw attachError;
				}
				if (!attached) {
					await upload.complete().catch(logUnsettled);
					throw attachError;
				}
			}
			await Promise.all([cleanUp(displaced), upload.complete().catch(logUnsettled)]);
		},

		async remove(actor, rosterId, expectedPath) {
			const keys = rosterKeys(actor, rosterId);
			assertScanKey(keys, expectedPath);
			const { data, error } = await request.rpc('remove_sign_in_roster_scan', {
				p_organization_id: keys.orgId,
				p_roster_id: keys.rosterId,
				p_expected_object_name: expectedPath
			});
			if (error) commandFailure(error);
			const row = onlyRow(data);
			if (row.outcome === 'changed' && row.retired_object_name === null) fail(409, SCAN_CHANGED_MESSAGE);
			if (row.outcome !== 'removed') throw new Error('Roster scan command was not acknowledged');
			return cleanUp(parseRetired(keys, row.retired_object_name, expectedPath));
		},

		async deleteRoster(actor, rosterId) {
			const keys = rosterKeys(actor, rosterId);
			const { data, error } = await request.rpc('delete_sign_in_roster', {
				p_organization_id: keys.orgId,
				p_roster_id: keys.rosterId
			});
			if (error) commandFailure(error);
			const row = onlyRow(data);
			if (typeof row.title !== 'string') throw new Error('Roster scan command was not acknowledged');
			return { title: row.title, fileCleanup: await cleanUp(parseRetired(keys, row.retired_object_name)) };
		}
	};
}
