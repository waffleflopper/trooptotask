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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_STRING_KEYS = new Set([
	'id',
	'inviteid',
	'membershipid',
	'newownerid',
	'oldtemplateid',
	'newtemplateid',
	'templateid',
	'userid',
	'personnelid',
	'trainingtypeid',
	'statustypeid',
	'assignmenttypeid',
	'requestid',
	'date',
	'pathname',
	'method',
	'type',
	'title',
	'name',
	'preset',
	'stagename',
	'stage_name',
	'template_id',
	'subjecttype',
	'subject_type',
	'subjectid',
	'subject_id',
	'subjectlabel',
	'subject_label',
	'revieweruserid',
	'reviewer_user_id',
	'noteauthoruserid',
	'note_author_user_id',
	'statetransition',
	'outcome',
	'failurecategory'
]);
const REDACTED_KEY_PARTS = [
	'phone',
	'address',
	'spouse',
	'emergency',
	'note',
	'notes',
	'reason',
	'body',
	'content',
	'payload'
];

function normalizeKey(key: string): string {
	return key.replace(/[_-]/g, '').toLowerCase();
}

function isEmailKey(key: string): boolean {
	return normalizeKey(key).includes('email');
}

function shouldRedactKey(key: string): boolean {
	const normalized = normalizeKey(key);
	return REDACTED_KEY_PARTS.some((part) => normalized.includes(part));
}

function maskEmail(value: string): string {
	const trimmed = value.trim().toLowerCase();
	const [localPart = '', domainPart = 'redacted.invalid'] = trimmed.split('@');
	if (!EMAIL_RE.test(trimmed) || localPart.length === 0) return '[redacted]';
	return `${localPart[0]}***@${domainPart}`;
}

function toPersonnelSubjectLabel(value: string): string {
	const trimmed = value.trim();
	const withComma = /^(\S+)\s+([^,]+),\s*(.+)$/.exec(trimmed);
	if (withComma) return `${withComma[1]} ${withComma[2].trim()}`;

	const parts = trimmed.split(/\s+/).filter(Boolean);
	if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
	return trimmed;
}

function sanitizeDetails(
	event: AuditEvent,
	requestInfo: {
		userId?: string | null;
		userEmail?: string | null;
	}
): Record<string, unknown> | undefined {
	const details = event.details ?? {};
	const sanitized: Record<string, unknown> = {};
	const redactedFields: string[] = [];

	for (const [key, value] of Object.entries(details)) {
		if (value === undefined) continue;
		if (key === 'actor') continue;

		const normalizedKey = normalizeKey(key);

		if (event.resourceType === 'personnel' && key === 'name' && typeof value === 'string') {
			sanitized.subject_label = toPersonnelSubjectLabel(value);
			continue;
		}

		if (isEmailKey(key)) {
			if (typeof value === 'string' && value.length > 0) sanitized[key] = maskEmail(value);
			else {
				sanitized[key] = '[redacted]';
				redactedFields.push(key);
			}
			continue;
		}

		if (SAFE_STRING_KEYS.has(normalizedKey)) {
			sanitized[key] = value;
			continue;
		}

		if (shouldRedactKey(key)) {
			sanitized[key] = '[redacted]';
			redactedFields.push(key);
			continue;
		}

		if (typeof value === 'string') {
			if (EMAIL_RE.test(value.trim())) {
				sanitized[key] = maskEmail(value);
				continue;
			}
			if (UUID_RE.test(value)) {
				sanitized[key] = value;
				continue;
			}
			sanitized[key] = '[redacted]';
			redactedFields.push(key);
			continue;
		}

		if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
			sanitized[key] = value;
			continue;
		}

		sanitized[key] = '[redacted]';
		redactedFields.push(key);
	}

	if (!requestInfo.userId && requestInfo.userEmail) {
		sanitized.actor_identifier = maskEmail(requestInfo.userEmail);
	}

	if (redactedFields.length > 0) {
		sanitized.redacted_fields = [...new Set(redactedFields)];
	}

	return Object.keys(sanitized).length > 0 ? sanitized : undefined;
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
		const details = sanitizeDetails(event, requestInfo);

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
