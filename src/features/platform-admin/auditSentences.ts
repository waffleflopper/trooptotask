export const ACTIVITY_CATEGORIES = ['access', 'accounts', 'organizations', 'security'] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];
export type AuditSeverity = 'info' | 'warning' | 'critical';

/** A stored audit row as Activity reads it. Rows written before write-time labels carry IDs only. */
export interface AuditEventRecord {
	id: string;
	timestamp: string;
	action: string;
	severity: string;
	userId: string | null;
	orgId: string | null;
	orgName: string | null;
	/** The actor's account as it stands now. Absent on rows from callers that do not look accounts up. */
	actorEmail?: string | null;
	actorName?: string | null;
	resourceType: string | null;
	resourceId: string | null;
	ipAddress: string | null;
	details: Record<string, unknown> | null;
}

export interface AuditField {
	label: string;
	value: string;
}

export interface DescribedAuditEvent {
	sentence: string;
	/** The line under the sentence: the reason or outcome, then the Organization the event happened in. */
	secondary: string | null;
	/** `null` for platform events outside the four filters, which show under All only. */
	category: ActivityCategory | null;
	severity: AuditSeverity;
	fields: AuditField[];
}

interface Subjects {
	actor: string;
	target: string;
	details: Record<string, unknown>;
	/** An Organization's owners can read the rows written for it, so a typed reason is not shown on them. */
	organizationScoped: boolean;
}

interface RegistryEntry {
	category: ActivityCategory | null;
	severity: AuditSeverity;
	sentence: (subjects: Subjects) => string;
	note?: (subjects: Subjects) => string | null;
}

const entry = (
	category: ActivityCategory | null,
	severity: AuditSeverity,
	sentence: RegistryEntry['sentence'],
	note?: RegistryEntry['note']
): RegistryEntry => ({ category, severity, sentence, note });

const reasonNote: RegistryEntry['note'] = (s) => {
	const reason = s.organizationScoped ? null : text(s.details.reason);
	return reason ? `Reason: ${reason}` : null;
};
const mfaRequired = () => 'Recent MFA was required';

/** Sentence text lives here and nowhere else. A new platform action is one more entry. */
const REGISTRY: Record<string, RegistryEntry> = {
	'access_request.approved': entry('access', 'info', (s) => `${s.actor} approved the access request from ${s.target}`),
	'access_request.rejected': entry(
		'access',
		'warning',
		(s) => `${s.actor} rejected the access request from ${s.target}`
	),
	'access_request.rescinded': entry('access', 'warning', (s) => `${s.actor} rescinded access for ${s.target}`),
	'access_request.account_setup_link_delivery_failed': entry(
		'access',
		'warning',
		(s) => `The setup email to ${s.target} could not be delivered`
	),
	'access_request.account_setup_approval_authorization_denied': entry(
		'security',
		'warning',
		(s) => `${s.actor} could not approve ${s.target}`,
		mfaRequired
	),
	'access_request.account_setup_resend_authorization_denied': entry(
		'security',
		'warning',
		(s) => `${s.actor} could not resend the setup link to ${s.target}`,
		mfaRequired
	),
	'access_request.rejection_authorization_denied': entry(
		'security',
		'warning',
		(s) => `${s.actor} could not reject ${s.target}`,
		mfaRequired
	),
	'access_request.rescission_authorization_denied': entry(
		'security',
		'warning',
		(s) => `${s.actor} could not rescind access for ${s.target}`,
		mfaRequired
	),
	'access_request.account_setup_approval_rate_limited': entry(
		'security',
		'warning',
		(s) => `Approving ${s.target} hit the setup email rate limit`
	),
	'access_request.account_setup_resend_rate_limited': entry(
		'security',
		'warning',
		(s) => `Resending the setup link to ${s.target} hit the setup email rate limit`
	),
	'account_setup.claimed': entry('access', 'info', (s) => `${s.target} opened an account setup link`),
	'account_setup.completed': entry('access', 'info', (s) => `${s.target} finished account setup`),
	'account_setup.failed': entry('access', 'warning', (s) => `Account setup failed for ${s.target}`),
	'account_setup.link_revoked': entry('access', 'info', (s) => `${s.actor} revoked the setup link for ${s.target}`),
	'account_setup.completion_rate_limited': entry(
		'security',
		'warning',
		(s) => `Finishing account setup for ${s.target} hit the rate limit`
	),
	'account_setup.renewal_rate_limited': entry(
		'security',
		'warning',
		(s) => `Renewing the setup link for ${s.target} hit the rate limit`
	),
	suspend_user: entry('accounts', 'critical', (s) => `${s.actor} suspended ${s.target}`, reasonNote),
	unsuspend_user: entry('accounts', 'warning', (s) => `${s.actor} unsuspended ${s.target}`, reasonNote),
	'admin.user.password_reset': entry('accounts', 'warning', (s) => `${s.actor} sent a password reset to ${s.target}`),
	'admin.user.resend_invite': entry('accounts', 'info', (s) => `${s.actor} resent the invite to ${s.target}`),
	suspend_org: entry('organizations', 'critical', (s) => `${s.actor} suspended ${s.target}`, reasonNote),
	unsuspend_org: entry('organizations', 'warning', (s) => `${s.actor} unsuspended ${s.target}`, reasonNote),
	'admin.org.transfer_ownership': entry(
		'organizations',
		'critical',
		(s) => `${s.actor} transferred ownership of ${s.target}`
	),
	'admin.org.membership_authorization_denied': entry(
		'security',
		'warning',
		(s) => `${s.actor} could not change the membership of ${s.target}`,
		mfaRequired
	),
	'auth.login_failure': entry('security', 'warning', (s) => `A sign-in to ${s.target} failed`),
	'auth.forgot_password_rate_limited': entry(
		'security',
		'warning',
		() => 'Password recovery requests hit the rate limit'
	),
	'auth.password_update_rate_limited': entry('security', 'warning', () => 'Password updates hit the rate limit'),
	'auth.session_revoke_failed': entry('security', 'warning', (s) => `Signing ${s.target} out everywhere failed`),
	'security.rate_limit_exceeded': entry('security', 'warning', () => 'A client exceeded a rate limit'),
	announcement_create: entry(null, 'info', (s) => `${s.actor} created the announcement ${s.target}`),
	announcement_activate: entry(null, 'info', (s) => `${s.actor} turned on the announcement ${s.target}`),
	announcement_deactivate: entry(null, 'info', (s) => `${s.actor} turned off the announcement ${s.target}`),
	announcement_delete: entry(null, 'warning', (s) => `${s.actor} deleted the announcement ${s.target}`)
};

/** An action with no entry yet still belongs to Activity when it starts with one of these. It shows under All, by its name. */
const PLATFORM_PREFIXES = ['access_request.', 'account_setup.', 'admin.', 'announcement_', 'security.'];

export function isActivityCategory(value: unknown): value is ActivityCategory {
	return (ACTIVITY_CATEGORIES as readonly unknown[]).includes(value);
}

/** The four filters hold registered actions only. */
export function activityScope(category: ActivityCategory | null): { actions: string[]; prefixes: string[] } {
	const actions = Object.keys(REGISTRY).filter((action) => !category || REGISTRY[action].category === category);
	return { actions, prefixes: category ? [] : PLATFORM_PREFIXES };
}

const REDACTED = '[redacted]';
const SHORT_ID_LENGTH = 8;
const shortId = (id: string) => id.slice(0, SHORT_ID_LENGTH);
const RESOURCE_NOUNS: Record<string, string> = {
	user: 'User',
	organization: 'Organization',
	access_request: 'Access request',
	platform_announcement: 'Announcement'
};

function text(value: unknown): string | null {
	return typeof value === 'string' && value.trim() !== '' && value !== REDACTED ? value : null;
}

function actorLabel(event: AuditEventRecord, details: Record<string, unknown>, viewerId: string | null): string {
	if (viewerId && event.userId === viewerId) return 'You';
	const name = text(event.actorName);
	if (name) return name;
	const email = text(details.actorEmail) ?? text(event.actorEmail);
	if (email) return email;
	if (event.userId) return `User ${shortId(event.userId)}`;
	return 'The system';
}

function actorField(event: AuditEventRecord, details: Record<string, unknown>): string {
	const name = text(event.actorName);
	const email = text(details.actorEmail) ?? text(event.actorEmail);
	if (name && email) return `${name} (${email})`;
	return name ?? email ?? event.userId ?? 'The system';
}

function targetLabel(event: AuditEventRecord, details: Record<string, unknown>): string {
	const written = text(details.targetName);
	if (written) return written;
	if (event.resourceType === 'organization' && event.orgName) return event.orgName;
	if (event.resourceType === 'platform_announcement')
		return text(details.title) ?? (event.resourceId ? shortId(event.resourceId) : 'an announcement');
	// Older access request rows kept only a masked address, which still tells the operator who it was.
	if (event.resourceType === 'access_request' && text(details.email)) return text(details.email)!;
	const noun = (event.resourceType && RESOURCE_NOUNS[event.resourceType]) || event.resourceType;
	if (event.resourceId) return `${noun ?? 'record'} ${shortId(event.resourceId)}`.replace(/^./, (c) => c.toUpperCase());
	return event.orgName ?? 'an unnamed record';
}

const FIELD_LABELS: Record<string, string> = {
	reason: 'Reason',
	fromUserId: 'Previous owner ID',
	toUserId: 'New owner ID',
	orgName: 'Organization name',
	targetEmail: 'Target email',
	blockedInvitationCount: 'Invitations blocked'
};
const HIDDEN_DETAIL_KEYS = new Set(['actorEmail', 'targetName', 'redacted_fields', 'actor_identifier']);

function humanize(key: string): string {
	const spaced = key
		.replace(/[_.-]+/g, ' ')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.toLowerCase()
		.trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function scalar(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string') return value === '' || value === REDACTED ? null : value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (Array.isArray(value)) return value.length === 0 ? null : value.map((item) => scalar(item) ?? '').join(', ');
	return null;
}

function flattenDetails(details: Record<string, unknown>, prefix: string[] = []): AuditField[] {
	const fields: AuditField[] = [];
	for (const [key, value] of Object.entries(details)) {
		if (prefix.length === 0 && HIDDEN_DETAIL_KEYS.has(key)) continue;
		const path = [...prefix, key];
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			if (path.length < 3) fields.push(...flattenDetails(value as Record<string, unknown>, path));
			continue;
		}
		const shown = scalar(value);
		if (shown === null) continue;
		const label = path.length === 1 && FIELD_LABELS[key] ? FIELD_LABELS[key] : path.map(humanize).join(' · ');
		fields.push({ label, value: shown });
	}
	return fields;
}

function severityOf(stored: string, fallback: AuditSeverity): AuditSeverity {
	return stored === 'info' || stored === 'warning' || stored === 'critical' ? stored : fallback;
}

/**
 * Everything Activity shows for one stored event. Pass the signed-in operator's ID and their own actions read "You".
 * Other admin pages call this for their own recent-event lists.
 */
export function describeAuditEvent(
	event: AuditEventRecord,
	options: { viewerId?: string | null } = {}
): DescribedAuditEvent {
	const details = event.details ?? {};
	const known = Object.hasOwn(REGISTRY, event.action) ? REGISTRY[event.action] : null;
	const actor = actorLabel(event, details, options.viewerId ?? null);
	const target = targetLabel(event, details);
	const subjects: Subjects = { actor, target, details, organizationScoped: Boolean(event.orgId) };
	const fields: AuditField[] = [
		{ label: 'Action', value: event.action },
		{ label: 'Actor', value: actorField(event, details) },
		...(text(details.targetName) || event.resourceId
			? [{ label: 'Target', value: text(details.targetName) ?? event.resourceId! }]
			: []),
		...(event.orgId ? [{ label: 'Organization', value: event.orgName ?? event.orgId }] : []),
		...flattenDetails(details),
		...(event.ipAddress ? [{ label: 'IP address', value: event.ipAddress }] : [])
	];
	const where = event.orgId && event.orgName && event.orgName !== target ? event.orgName : null;
	return {
		sentence: known ? known.sentence(subjects) : event.action,
		secondary: [known?.note?.(subjects) ?? null, where].filter(Boolean).join(' · ') || null,
		category: known?.category ?? null,
		severity: severityOf(event.severity, known?.severity ?? 'info'),
		fields
	};
}
