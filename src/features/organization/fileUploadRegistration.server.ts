import type { SupabaseClient } from '$lib/server/database';
import { validateUUID } from '$lib/server/validation';
import type { OrganizationFileUploadRegistration } from './contracts';

/** Called only by an already authorized, resource-bound server uploader. */
export async function registerOrganizationFileUpload(
	admin: SupabaseClient,
	input: {
		orgId: string;
		userId: string;
		bucket: 'counseling-files' | 'personnel-documents' | 'training-certificates';
		path: string;
	}
): Promise<OrganizationFileUploadRegistration> {
	if (!validateUUID(input.orgId) || !validateUUID(input.userId)) throw new Error('Invalid file upload identity');
	const args = {
		p_upload_id: crypto.randomUUID(),
		p_organization_id: input.orgId.toLowerCase(),
		p_actor_id: input.userId.toLowerCase(),
		p_bucket_id: input.bucket,
		p_object_name: input.path
	};
	const started = await admin.rpc('register_organization_file_upload', args);
	if (started.error || started.data !== args.p_upload_id) {
		throw new Error('Organization file upload could not be registered');
	}
	return {
		async complete() {
			// No finally, expiry or uncertain-outcome retry: the caller must first
			// acknowledge its attachment or actual file compensation.
			const settled = await admin.rpc('settle_organization_file_upload', args);
			if (settled.error || settled.data !== true) throw new Error('File upload completion could not be confirmed');
		}
	};
}
