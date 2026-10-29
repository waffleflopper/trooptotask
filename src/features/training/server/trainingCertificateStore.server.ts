import type { SupabaseClient } from '$lib/server/database';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { buildSensitiveFilePath } from '$lib/storage/sensitiveFiles';
import { registerOrganizationFileUpload, removeRetiredOrganizationFiles } from '$features/organization/index.server';
import type { TrainingCertificateStore } from './trainingCompletionPorts.server';

export const TRAINING_CERTIFICATE_BUCKET = 'training-certificates';

// The database derives the owned folder from uuid::text, which is lowercase.
function certificateScope(personnelId: string): string {
	return `personnel/${personnelId.toLowerCase()}/training-certificates`;
}

export function trainingCertificatePath(orgId: string, personnelId: string, filename: string): string {
	return buildSensitiveFilePath({
		orgId: orgId.toLowerCase(),
		scope: certificateScope(personnelId),
		recordId: crypto.randomUUID(),
		filename
	});
}

export function isOwnedTrainingCertificate(orgId: string, personnelId: string, path: string): boolean {
	const prefix = `${orgId.toLowerCase()}/${certificateScope(personnelId)}/`;
	return (
		path.startsWith(prefix) &&
		path.length > prefix.length &&
		!path.split('/').some((part) => part === '..' || part === '.')
	);
}

/** Uploads through the service role after the operation admits the actor; viewers sign links under RLS. */
export function createSupabaseTrainingCertificateStore(
	requestClient: SupabaseClient,
	getAdminClient: () => SupabaseClient,
	actor: Pick<OrganizationAccessGrant, 'orgId' | 'userId'>
): TrainingCertificateStore {
	async function reconcile(personnelId: string, path: string): Promise<string | null> {
		const admin = getAdminClient();
		const { data, error } = await admin.rpc('reconcile_personnel_file_attachment', {
			p_organization_id: actor.orgId,
			p_personnel_id: personnelId,
			p_kind: 'certificate',
			p_object_name: path
		});
		if (error) throw new Error(error.message);
		if (typeof data === 'string' && data) return data;
		if (data !== null) throw new Error('File attachment reconciliation was not acknowledged');
		await removeRetiredOrganizationFiles(admin, [{ bucket_id: TRAINING_CERTIFICATE_BUCKET, object_name: path }]);
		return null;
	}

	return {
		async upload(personnelId, path, file) {
			if (!isOwnedTrainingCertificate(actor.orgId, personnelId, path))
				throw new Error('Certificate path is outside the authorized Person');
			const admin = getAdminClient();
			const registration = await registerOrganizationFileUpload(admin, {
				orgId: actor.orgId,
				userId: actor.userId,
				bucket: TRAINING_CERTIFICATE_BUCKET,
				path
			});
			try {
				const { data, error } = await admin.storage
					.from(TRAINING_CERTIFICATE_BUCKET)
					.upload(path, file, { upsert: false, contentType: file.type });
				if (error) throw new Error(`Storage upload failed: ${error.message}`);
				if (data?.path !== path || data.fullPath !== `${TRAINING_CERTIFICATE_BUCKET}/${path}`)
					throw new Error('Storage upload was not acknowledged');
			} catch (error) {
				// A failed upload may still have stored bytes; retire the key before releasing the registration.
				await reconcile(personnelId, path);
				await registration.complete();
				throw error;
			}
			return registration;
		},
		reconcile,
		async signedUrl(path, expiresInSeconds) {
			const { data, error } = await requestClient.storage
				.from(TRAINING_CERTIFICATE_BUCKET)
				.createSignedUrl(path, expiresInSeconds);
			if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Certificate link could not be created');
			return data.signedUrl;
		}
	};
}
