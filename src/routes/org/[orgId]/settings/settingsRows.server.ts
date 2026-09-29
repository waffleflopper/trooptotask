export interface OrganizationSettingsRow {
	archive_retention_months?: number | null;
	loss_warning_window_days?: number | null;
}

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
