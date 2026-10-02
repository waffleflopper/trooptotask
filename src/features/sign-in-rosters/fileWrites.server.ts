import type { SupabaseClient } from '@supabase/supabase-js';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { SENSITIVE_FILE_BUCKET } from '$lib/storage/sensitiveFiles';
import { registerOrganizationFileUpload } from '$features/organization/index.server';
import type { SignInRosterFileWritePort } from './contracts';

export function createSupabaseSignInRosterFileWritePort(
	request: SupabaseClient,
	getAdminClient: () => SupabaseClient
): SignInRosterFileWritePort {
	return {
		async forRoster(actor, rosterId) {
			const { data: roster, error } = await request
				.from('sign_in_rosters')
				.select('scope_group_ids')
				.eq('organization_id', actor.orgId)
				.eq('id', rosterId)
				.maybeSingle();
			if (error) throw new Error('Roster access could not be confirmed');
			if (!roster) throw Object.assign(new Error('Roster not found'), { status: 404 });
			if (!Array.isArray(roster.scope_group_ids) || roster.scope_group_ids.some((id) => typeof id !== 'string'))
				throw new Error('Roster Group scope could not be confirmed');
			for (const group of roster.scope_group_ids.length ? roster.scope_group_ids : [null]) {
				await requireFeaturePolicy(
					{ auth: actor },
					POLICY_ACTION_CATALOG.training.manageSignInRosters,
					policyResourceForGroup(group),
					'sign_in_roster',
					rosterId
				);
			}
			const admin = getAdminClient();
			function assertPath(path: string) {
				const prefix = `${actor.orgId}/sign-in-rosters/${rosterId}/`;
				if (
					!path.startsWith(prefix) ||
					path.length === prefix.length ||
					path.split('/').some((part) => part === '.' || part === '..')
				)
					throw Object.assign(new Error('Scan path is outside the authorized roster'), { status: 400 });
			}
			async function removeFile(path: string, previous: boolean) {
				assertPath(path);
				const { data, error } = await request.storage.from(SENSITIVE_FILE_BUCKET).remove([path]);
				if (!error && data?.length === 1 && data[0].name === path) return;
				if (previous && !error && Array.isArray(data) && data.length === 0) {
					// An ordinary empty ACK can also hide an existing object through RLS.
					// Read only this admitted roster's exact key with the server provider.
					const current = await admin.storage.from(SENSITIVE_FILE_BUCKET).info(path);
					// Storage uses HTTP 400 with embedded 404 for NoSuchKey. The SDK
					// drops its code, so distinguish it from the missing-bucket message.
					if (
						current.data === null &&
						(current.error?.status === 400 || current.error?.status === 404) &&
						current.error.statusCode === '404' &&
						current.error.message === 'Object not found'
					)
						return;
				}
				throw new Error('Scan file removal could not be confirmed');
			}
			return {
				async upload(path, file) {
					assertPath(path);
					if (!(file instanceof File)) throw Object.assign(new Error('A scan file is required'), { status: 400 });
					const registration = await registerOrganizationFileUpload(admin, {
						orgId: actor.orgId,
						userId: actor.userId,
						bucket: SENSITIVE_FILE_BUCKET,
						path
					});
					// Privileged byte transport must preserve the ordinary uploader's
					// fresh Training/Group admission, rather than trust an older context.
					try {
						const current = await request.rpc('sensitive_file_object_is_writable', {
							bucket_name: SENSITIVE_FILE_BUCKET,
							object_name: path
						});
						if (current.error || current.data !== true)
							throw Object.assign(new Error('Current roster upload access is required'), { status: 403 });
					} catch (error) {
						// Storage has not been called, so no byte writer can remain in flight.
						await registration.complete();
						throw error;
					}
					const { data, error } = await admin.storage.from(SENSITIVE_FILE_BUCKET).upload(path, file, { upsert: false });
					if (error || data?.path !== path || data.fullPath !== `${SENSITIVE_FILE_BUCKET}/${path}`)
						throw new Error('Scan upload could not be confirmed');
					return registration;
				},
				remove: (path) => removeFile(path, false),
				removePrevious: (path) => removeFile(path, true)
			};
		}
	};
}
