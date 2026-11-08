export const DELETION_REQUEST_STATUSES = ['pending', 'approved', 'denied', 'cancelled'] as const;
export type DeletionRequestStatus = (typeof DELETION_REQUEST_STATUSES)[number];
export type DeletionRequestResourceType =
	| 'personnel'
	| 'counseling_record'
	| 'training_type'
	| 'personnel_training'
	| 'rating_scheme_entry';

/** Saved request history retains its original values, including historical resource types. */
export interface DeletionRequest {
	id: string;
	organization_id: string;
	requested_by: string;
	requested_by_email: string | null;
	resource_type: string;
	resource_id: string;
	resource_description: string | null;
	resource_url: string | null;
	status: DeletionRequestStatus;
	reviewed_by: string | null;
	reviewed_at: string | null;
	denial_reason: string | null;
	created_at: string;
}

export type DeletionRequestApproval = Pick<
	DeletionRequest,
	| 'id'
	| 'status'
	| 'requested_by_email'
	| 'resource_description'
	| 'resource_type'
	| 'resource_url'
	| 'created_at'
	| 'denial_reason'
>;

/** A request on a person archives them; a request on any other record deletes it. */
export const ARCHIVE_RESOURCE_TYPE = 'personnel' satisfies DeletionRequestResourceType;

export type PendingApprovalKind = 'archive' | 'deletion';

export interface PendingApprovalGroup {
	kind: PendingApprovalKind;
	count: number;
	oldestCreatedAt: string;
}

/** Pending requests by kind, oldest first within each; a kind with none waiting is left out. */
export type PendingDeletionRequestSummary = readonly PendingApprovalGroup[];
