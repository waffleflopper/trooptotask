export const TABLE = 'deletion_requests';
export const AUDIT_RESOURCE = 'deletion_request';

export function fireAndForgetNotification(send: () => Promise<void>): void {
	try {
		void send().catch(() => {});
	} catch {
		// Ignore notification delivery failures — mutations must still succeed.
	}
}

export const RESOURCE_TYPE_TABLE_MAP: Record<string, string> = {
	personnel: 'personnel',
	counseling_record: 'counseling_records'
};

export function isSupportedResourceType(resourceType: string): boolean {
	return (
		resourceType === 'rating_scheme_entry' ||
		resourceType === 'training_type' ||
		resourceType === 'personnel_training' ||
		Boolean(RESOURCE_TYPE_TABLE_MAP[resourceType])
	);
}
