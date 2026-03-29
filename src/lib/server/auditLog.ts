import { getAdminClient } from './supabase';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string;
	orgId?: string;
	details?: Record<string, unknown>;
	severity?: AuditSeverity;
}

/**
 * Log a security-relevant event to the audit_logs table.
 * Uses service role client (append-only, bypasses RLS).
 * Fails silently — audit logging should never break the request.
 */
export async function auditLog(
	event: AuditEvent,
	requestInfo: {
		userId?: string | null;
		userEmail?: string | null;
		ip?: string;
		userAgent?: string;
	}
): Promise<void> {
	try {
		const admin = getAdminClient();
		const details = { ...(event.details ?? {}) };
		if (details.actor === undefined && requestInfo.userEmail) {
			details.actor = requestInfo.userEmail;
		}

		await admin.from('audit_logs').insert({
			user_id: requestInfo.userId ?? null,
			org_id: event.orgId ?? null,
			action: event.action,
			resource_type: event.resourceType,
			resource_id: event.resourceId ?? null,
			ip_address: requestInfo.ip ?? null,
			user_agent: requestInfo.userAgent ?? null,
			details,
			severity: event.severity ?? 'info'
		});
	} catch {
		console.error('Audit log write failed');
	}
}

/**
 * Extract request info from SvelteKit event for audit logging.
 */
export function getRequestInfo(event: {
	getClientAddress: () => string;
	request: { headers: Headers };
	locals: { user?: { id: string; email?: string | null } | null };
}): { userId: string | null; userEmail: string | null; ip: string; userAgent: string } {
	return {
		userId: event.locals.user?.id ?? null,
		userEmail: event.locals.user?.email ?? null,
		ip: event.getClientAddress(),
		userAgent: event.request.headers.get('user-agent') ?? ''
	};
}
