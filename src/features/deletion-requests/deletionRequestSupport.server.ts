import type { DeletionRequestResourceType } from './contracts';

export const TABLE = 'deletion_requests';
export const AUDIT_RESOURCE = 'deletion_request';

export function fireAndForgetNotification(send: () => Promise<void>): void {
	try {
		void send().catch(() => {});
	} catch {
		// Ignore notification delivery failures — mutations must still succeed.
	}
}

export function isSupportedResourceType(resourceType: string): resourceType is DeletionRequestResourceType {
	return (
		resourceType === 'personnel' ||
		resourceType === 'counseling_record' ||
		resourceType === 'training_type' ||
		resourceType === 'personnel_training' ||
		resourceType === 'rating_scheme_entry'
	);
}
