export type DeletionRequestStatus = 'pending' | 'approved' | 'denied';

export interface DeletionRequestRow {
	id: string;
	status: DeletionRequestStatus;
	requester_email: string | null;
	resource_description: string | null;
	resource_type: string;
	resource_url: string | null;
	created_at: string;
	denial_reason: string | null;
}
