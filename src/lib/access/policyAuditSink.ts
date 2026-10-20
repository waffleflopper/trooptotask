/** Delivery supplies this collaborator; Access does not import an event consumer. */
export interface PolicyAuditSink {
	log(event: {
		action: string;
		resourceType: string;
		resourceId?: string;
		orgId?: string;
		details?: Record<string, unknown>;
		severity?: 'info' | 'warning' | 'critical';
	}): void | Promise<void>;
}
