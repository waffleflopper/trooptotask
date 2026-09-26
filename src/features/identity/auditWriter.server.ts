export type IdentityAuditWriter = (
	event: {
		action: string;
		resourceType: string;
		resourceId?: string;
		severity?: 'warning';
		details?: Record<string, unknown>;
	},
	requestInfo: {
		userId?: string | null;
		userEmail?: string | null;
		ip?: string;
		userAgent?: string;
	}
) => Promise<void>;
