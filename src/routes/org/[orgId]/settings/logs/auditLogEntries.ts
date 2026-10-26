import type { AuditLogEntry } from '$lib/audit/contracts';
import { formatDayMonth, localDateIn } from '$lib/utils/dates';

export type AuditScope = 'access' | 'records' | 'deletions';
export type AuditScopeFilter = 'all' | AuditScope;

export const AUDIT_SCOPE_OPTIONS: readonly { value: AuditScopeFilter; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'access', label: 'Access' },
	{ value: 'records', label: 'Records' },
	{ value: 'deletions', label: 'Deletions' }
];

/** First match wins, so Deletions is checked before Access; anything unmatched is a record change. */
const SCOPE_RULES: readonly (readonly [AuditScope, RegExp])[] = [
	['deletions', /^deletion_request\./],
	['deletions', /[._](deleted|archived|purged)$/],
	['access', /^(member|organization_invitation|access_request|org|organization|policy)\./]
];

export function auditScope(action: string): AuditScope {
	return SCOPE_RULES.find(([, pattern]) => pattern.test(action))?.[0] ?? 'records';
}

/** First match wins, so the narrower `organization.rank_catalog.` sits above `organization.`. */
const AREA_RULES: readonly (readonly [RegExp, string])[] = [
	[/^organization\.rank_catalog\./, 'Ranks'],
	[/^organization\.settings_updated$/, 'Policies'],
	[/^(member|organization_invitation|access_request)\./, 'Members'],
	[/^deletion_request\./, 'Approvals'],
	[/^(org|organization)\./, 'Unit'],
	[/^personnel\.(permanently_deleted|restored)$/, 'Archives'],
	[/^(personnel_ict_completion|ict_task|critical_tasks)\./, 'Critical tasks'],
	[/^(training|training_type|training_view|training_record)\./, 'Training'],
	[
		/^(availability|status_type|assignment_type|special_day|calendar_report|daily_assignment|calendar_event|calendar_tasking)\./,
		'Calendar'
	],
	[/^onboarding/, 'Onboarding'],
	[/^rating_scheme\./, 'Evals'],
	[/^sign_in_roster\./, 'Rosters'],
	[/^personnel\./, 'Personnel'],
	[/^(group|pinned_group)\./, 'Groups'],
	[/^export\./, 'Exports'],
	[/^policy\./, 'Access'],
	[/^(auth|account_setup|security)\./, 'Security'],
	[/^(notification|user_preferences)\./, 'Account'],
	[/^(admin\.|announcement_|(un)?suspend_)/, 'Platform']
];

function words(segment: string): string {
	return segment.replace(/[._>]+/g, ' ').trim();
}

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function auditArea(action: string): string {
	return AREA_RULES.find(([pattern]) => pattern.test(action))?.[1] ?? capitalize(words(action.split('.')[0] ?? action));
}

type Details = Record<string, unknown>;

/** A shown value: the sanitizer stores `[redacted]` in place of anything it will not keep. */
function str(details: Details, key: string): string | undefined {
	const value = details[key];
	return typeof value === 'string' && value.trim() && value !== '[redacted]' ? value.trim() : undefined;
}

function num(details: Details, key: string): number | undefined {
	const value = details[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function plural(count: number, one: string, many: string): string {
	return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

/** "3 people" from a count in the details, or just "people" when the writer kept no count. */
function amount(details: Details, key: string, one: string, many: string): string {
	const count = num(details, key);
	return count === undefined ? many : plural(count, one, many);
}

function counts(details: Details, parts: readonly (readonly [string, string])[]): string {
	const shown = parts.flatMap(([key, label]) => {
		const value = num(details, key);
		return value === undefined ? [] : [`${value.toLocaleString('en-US')} ${label}`];
	});
	return shown.length > 0 ? ` (${shown.join(', ')})` : '';
}

function subject(details: Details): string | undefined {
	return str(details, 'subject_label') ?? str(details, 'personnel') ?? str(details, 'name') ?? str(details, 'title');
}

function change(label: string, before: unknown, after: unknown, unit = ''): string | undefined {
	if (after === undefined || after === null) return undefined;
	return before === undefined || before === null
		? `${label} set to ${String(after)}${unit}`
		: `${label} ${String(before)}${unit} → ${String(after)}${unit}`;
}

const FEATURE_LABELS: Record<string, string> = {
	training: 'Training',
	criticalTasks: 'Critical tasks',
	evaluations: 'Evaluations',
	onboarding: 'Onboarding',
	lossesAndAwards: 'Losses and awards',
	eventsAndTaskings: 'Events & Taskings'
};

function featureKeys(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : [];
}

function featureSwitchChanges(details: Details): string[] {
	if (!Array.isArray(details.disabled_features)) return [];
	const before = new Set(featureKeys(details.previous_disabled_features));
	const after = new Set(featureKeys(details.disabled_features));
	const label = (key: string) => FEATURE_LABELS[key] ?? key;
	const off = [...after].filter((key) => !before.has(key)).map(label);
	const on = [...before].filter((key) => !after.has(key)).map(label);
	const clauses = [
		...(off.length > 0 ? [`Turned off ${off.join(', ')}`] : []),
		...(on.length > 0 ? [`Turned on ${on.join(', ')}`] : [])
	];
	return clauses.length > 0 ? clauses : ['Saved feature switches with no change'];
}

function settingsUpdated(details: Details): string {
	const storageCap = num(details, 'personnel_document_storage_cap_bytes');
	const clauses = [
		...featureSwitchChanges(details),
		change('Strength floor', details.previous_strength_floor_percent, details.strength_floor_percent, '%'),
		change('Loss warning window', undefined, details.loss_warning_window_days, ' days'),
		change('Training readiness goal', undefined, details.training_readiness_goal_percent, '%'),
		change('Archive retention', undefined, details.archive_retention_months, ' months'),
		storageCap === undefined ? undefined : `Document storage cap set to ${Math.round(storageCap / 1024 / 1024)} MB`
	].filter((clause): clause is string => clause !== undefined);
	return clauses.length > 0 ? clauses.join('; ') : 'Updated unit settings';
}

function deletionRequest(verb: string): (details: Details) => string {
	return (details) => {
		const kind = details.subject_type === 'personnel' ? 'archive' : 'deletion';
		return `${verb} ${kind} of ${subject(details) ?? 'a record'}`;
	};
}

function trainingRecord(verb: string): (details: Details) => string {
	return (details) => {
		const type = str(details, 'training_type');
		const person = str(details, 'personnel');
		if (type && person) return `${verb} ${type} for ${person}`;
		if (type ?? person) return `${verb} a training record for ${type ?? person}`;
		return `${verb} a training record`;
	};
}

function emailed(template: (email: string) => string, fallback: string): (details: Details) => string {
	return (details) => {
		const email = str(details, 'email');
		return email ? template(email) : fallback;
	};
}

/** A change to one equipment or checklist item, with the Tasking it belongs to. */
const taskingItem =
	(verb: string, kind: string) =>
	(details: Details): string => {
		const item = str(details, 'item');
		const tasking = str(details, 'title');
		return `${verb} ${kind}${item ? ` ${item}` : ''}${tasking ? ` on ${tasking}` : ''}`;
	};

type Sentence = string | ((details: Details) => string);

/** Exact actions whose wording the generic verb and noun below would get wrong. */
const SENTENCES: Record<string, Sentence> = {
	'organization.settings_updated': settingsUpdated,
	'calendar_tasking.equipment_added': taskingItem('Added', 'equipment'),
	'calendar_tasking.equipment_changed': taskingItem('Changed', 'equipment'),
	'calendar_tasking.equipment_secured': taskingItem('Updated secured count of', 'equipment'),
	'calendar_tasking.equipment_removed': taskingItem('Removed', 'equipment'),
	'calendar_tasking.equipment_reordered': taskingItem('Reordered', 'equipment'),
	'calendar_tasking.checklist_added': taskingItem('Added', 'checklist item'),
	'calendar_tasking.checklist_renamed': taskingItem('Renamed', 'checklist item'),
	'calendar_tasking.checklist_completed': taskingItem('Completed', 'checklist item'),
	'calendar_tasking.checklist_reopened': taskingItem('Reopened', 'checklist item'),
	'calendar_tasking.checklist_removed': taskingItem('Removed', 'checklist item'),
	'calendar_tasking.checklist_reordered': taskingItem('Reordered', 'checklist item'),
	'organization.rank_catalog.bulk_state_changed': (d) =>
		`Changed the state of ${amount(d, 'changedCount', 'rank', 'ranks')}`,
	'organization.rank_catalog.reconciled': 'Reconciled the rank catalog',
	'organization.rank_catalog.service_pack_added': (d) =>
		`Added ${amount(d, 'addedCount', 'rank', 'ranks')} from a branch pack`,
	'org.renamed': (d) => (str(d, 'name') ? `Renamed the unit to ${str(d, 'name')}` : 'Renamed the unit'),
	'org.url_slug_updated': 'Changed the web address',
	'org.url_slug_cleared': 'Cleared the web address',
	'org.ownership_transferred': 'Transferred unit ownership',
	'org.deleted': 'Deleted the unit',
	'deletion_request.created': deletionRequest('Requested'),
	'deletion_request.approved': deletionRequest('Approved'),
	'deletion_request.denied': deletionRequest('Denied'),
	'deletion_request.cancelled': 'Cancelled a deletion request',
	'member.invite': emailed((email) => `Invited ${email}`, 'Invited a member'),
	'member.invite_revoked': 'Revoked an invitation',
	'member.invite_email_sent': emailed((email) => `Sent the invitation email to ${email}`, 'Sent an invitation email'),
	'member.invite_email_resent': emailed(
		(email) => `Resent the invitation email to ${email}`,
		'Resent an invitation email'
	),
	'member.invite_email_delivery_failed': emailed(
		(email) => `Could not send the invitation email to ${email}`,
		'Could not send an invitation email'
	),
	'member.invite_email_resend_delivery_failed': emailed(
		(email) => `Could not resend the invitation email to ${email}`,
		'Could not resend an invitation email'
	),
	'member.invite_access_request_created': 'Opened an access request for an invitation',
	'member.invite_access_request_linked': 'Linked an invitation to an access request',
	'member.invite_access_request_already_linked': 'Found an invitation already linked to an access request',
	'member.invite_access_request_link_failed': 'Could not link an invitation to an access request',
	'member.invite_access_request_link_block_failed': 'Could not block an invitation after a failed access request link',
	'member.invite_account_setup_link_not_created': 'Could not create an account setup link for an invitation',
	'member.invite_account_setup_link_block_failed': 'Could not block an invitation after a failed account setup link',
	'member.high_privilege_invite_authorization_denied': 'Blocked an admin invitation until identity is confirmed again',
	'member.high_privilege_remove_authorization_denied': 'Blocked removing an admin until identity is confirmed again',
	'member.high_privilege_update_authorization_denied':
		'Blocked an admin access change until identity is confirmed again',
	'member.invite_rate_limited': 'Blocked an invitation over the rate limit',
	'member.invite_resend_rate_limited': 'Blocked an invitation resend over the rate limit',
	'org.delete_authorization_denied': 'Blocked deleting the unit until identity is confirmed again',
	'admin.org.membership_authorization_denied': 'Blocked a platform membership change until identity is confirmed again',
	'access_request.rejection_authorization_denied':
		'Blocked rejecting an access request until identity is confirmed again',
	'access_request.rescission_authorization_denied':
		'Blocked rescinding an access request until identity is confirmed again',
	'auth.forgot_password_rate_limited': 'Blocked a password reset request over the rate limit',
	'account_setup.completion_rate_limited': 'Blocked account setup completion over the rate limit',
	'account_setup.renewal_rate_limited': 'Blocked an account setup link renewal over the rate limit',
	'member.access_changed': 'Changed member access',
	'member.removed': 'Removed a member',
	'member.left': 'Left the unit',
	'organization_invitation.accepted': 'Accepted an invitation to the unit',
	'organization_invitation.declined': 'Declined an invitation to the unit',
	'organization_invitation.blocked_by_access_request_rejection':
		'Blocked an invitation after its access request was rejected',
	'organization_invitation.blocked_by_access_request_rescission':
		'Blocked an invitation after its access request was rescinded',
	'access_request.approved': emailed(
		(email) => `Approved the access request for ${email}`,
		'Approved an access request'
	),
	'access_request.rejected': 'Rejected an access request',
	'access_request.rescinded': 'Rescinded an access request',
	'access_request.account_setup_link_sent': emailed(
		(email) => `Sent an account setup link to ${email}`,
		'Sent an account setup link'
	),
	'access_request.account_setup_link_resent': emailed(
		(email) => `Resent an account setup link to ${email}`,
		'Resent an account setup link'
	),
	'access_request.account_setup_link_delivery_failed': emailed(
		(email) => `Could not send an account setup link to ${email}`,
		'Could not send an account setup link'
	),
	'account_setup.claimed': 'Opened an account setup link',
	'account_setup.completed': 'Completed account setup',
	'account_setup.failed': 'Account setup failed',
	'account_setup.link_revoked': 'Replaced an account setup link',
	'account_setup.claim_released_by_staff': 'Released an account setup claim',
	'admin.org.make_admin': 'Platform staff made a member an admin',
	'admin.org.transfer_ownership': 'Platform staff transferred unit ownership',
	'admin.user.password_reset': 'Platform staff sent a password reset',
	'admin.user.resend_invite': 'Platform staff resent an invitation',
	announcement_create: 'Created an announcement',
	announcement_activate: 'Turned on an announcement',
	announcement_deactivate: 'Turned off an announcement',
	announcement_delete: 'Deleted an announcement',
	suspend_user: 'Suspended a user',
	unsuspend_user: 'Lifted a user suspension',
	suspend_org: 'Suspended the unit',
	unsuspend_org: 'Lifted the unit suspension',
	'auth.login_success': 'Signed in',
	'auth.login_failure': emailed((email) => `Failed sign-in as ${email}`, 'Failed sign-in'),
	'auth.session_revoke_failed': 'Could not sign out other sessions after a password change',
	'security.rate_limit_exceeded': 'Blocked a request over the rate limit',
	'policy.denied': 'Blocked an action without permission',
	'personnel.created': (d) => `Added ${subject(d) ?? 'a person'}`,
	'personnel.updated': (d) => `Updated ${subject(d) ?? 'a person'}`,
	'personnel.archived': (d) => `Archived ${subject(d) ?? 'a person'}`,
	'personnel.restored': (d) => `Restored ${subject(d) ?? 'a person'} from Archives`,
	'personnel.permanently_deleted': (d) => `Permanently deleted ${subject(d) ?? 'a person'}`,
	'personnel.exported': (d) => `Exported the record of ${subject(d) ?? 'a person'}`,
	'personnel.bulk_created': (d) => `Added ${amount(d, 'count', 'person', 'people')}`,
	'personnel.bulk_archived': (d) => `Archived ${amount(d, 'count', 'person', 'people')}`,
	'personnel.bulk_merged': (d) =>
		`Imported personnel${counts(d, [
			['created', 'added'],
			['updated', 'updated'],
			['skipped', 'skipped'],
			['errors', 'failed']
		])}`,
	'personnel.award_tracking_acknowledged': 'Acknowledged an award tracking flag',
	'personnel.award_tracking_cleared': 'Cleared an award tracking flag',
	'personnel.extended_info.updated': 'Updated extended info',
	'availability.bulk_created': (d) => `Added ${amount(d, 'count', 'availability entry', 'availability entries')}`,
	'availability.bulk_deleted': (d) => `Deleted ${amount(d, 'count', 'availability entry', 'availability entries')}`,
	'assignment_type.calendar_lanes_set': 'Set the calendar lanes for assignment types',
	'calendar_report.viewed': 'Viewed a calendar report',
	'daily_assignment.replaced': (d) => {
		const date = str(d, 'date');
		return `Set ${amount(d, 'count', 'daily assignment', 'daily assignments')}${date ? ` for ${formatDayMonth(date)}` : ''}`;
	},
	'daily_assignment.batch_replaced': (d) =>
		`Replaced daily assignments${counts(d, [
			['inserted', 'set'],
			['cleared', 'cleared']
		])}`,
	'daily_assignment.cleared': (d) => {
		const date = str(d, 'date');
		return `Cleared a daily assignment${date ? ` for ${formatDayMonth(date)}` : ''}`;
	},
	'special_day.federal_holidays_reset': 'Reset the federal holidays',
	'status_type.reordered': 'Reordered status types',
	'ict_task.reordered': 'Reordered critical tasks',
	'ict_task.bulk_imported': (d) =>
		`Imported critical tasks${counts(d, [
			['inserted', 'added'],
			['updated', 'updated']
		])}`,
	'personnel_ict_completion.bulk_imported': (d) =>
		`Imported critical task completions${counts(d, [
			['inserted', 'added'],
			['updated', 'updated']
		])}`,
	'critical_tasks.defaults_updated': (d) =>
		[
			change('Default expiration', undefined, d.defaultExpirationMonths, ' months'),
			change('Expiring-soon warning', undefined, d.expiringSoonWarningDays, ' days')
		]
			.filter((clause): clause is string => clause !== undefined)
			.join('; ') || 'Updated critical task defaults',
	'training.bulk_imported': (d) =>
		`Imported training records${counts(d, [
			['inserted', 'added'],
			['updated', 'updated'],
			['exempted', 'exempted']
		])}`,
	'training_record.created': trainingRecord('Added'),
	'training_record.updated': trainingRecord('Updated'),
	'training_record.corrected': trainingRecord('Corrected'),
	'training_record.deleted': trainingRecord('Deleted'),
	'training_type.updated': (d) => {
		const person = str(d, 'personnel');
		if (d.exempt === true) return `Exempted ${person ?? 'a person'} from a training type`;
		if (d.exempt === false) return `Removed the exemption for ${person ?? 'a person'} from a training type`;
		return 'Updated a training type';
	},
	'onboarding.started': 'Started an onboarding',
	'onboarding.completed': 'Completed an onboarding',
	'onboarding.resynced': 'Updated an onboarding from its template',
	'onboarding.template_switched': 'Switched an onboarding to another template',
	'onboarding_step.inactive_removed': 'Removed inactive onboarding steps',
	'onboarding_step.note_added': 'Added a note to an onboarding step',
	'onboarding_step.stage_advanced': (d) =>
		str(d, 'stage_name')
			? `Moved an onboarding step to ${str(d, 'stage_name')}`
			: 'Moved an onboarding step to its next stage',
	'onboarding_step.toggled': (d) =>
		d.completed === false ? 'Reopened an onboarding step' : 'Checked off an onboarding step',
	'onboarding_template.duplicated': (d) => {
		const steps = num(d, 'stepCount');
		return `Duplicated an onboarding template${steps === undefined ? '' : ` with ${plural(steps, 'step', 'steps')}`}`;
	},
	'onboarding_template_step.reordered': 'Reordered onboarding template steps',
	'sign_in_roster.scan_uploaded': 'Uploaded a signed roster scan',
	'pinned_group.replaced': 'Replaced pinned groups',
	'notification.read': 'Read a notification',
	'notification.mark_all_read': 'Marked all notifications read',
	'notification.delete_all': 'Deleted all notifications',
	'export.created': 'Exported unit data as JSON',
	'export.excel_created': 'Exported unit data as Excel',
	'user_preferences.updated': 'Updated preferences'
};

/** Families of actions sharing one wording, checked when no exact sentence applies. */
const SENTENCE_PATTERNS: readonly (readonly [RegExp, (match: RegExpExecArray) => string])[] = [
	[/^.*\.(.+)_authorization_denied$/, (match) => `Blocked ${words(match[1])} until identity is confirmed again`],
	[/^.*\.(.+)_rate_limited$/, (match) => `Blocked ${words(match[1])} over the rate limit`]
];

/** What each record family is called in a sentence. */
const NOUNS: Record<string, string> = {
	assignment_type: 'assignment type',
	availability: 'availability entry',
	daily_assignment: 'daily assignment',
	calendar_event: 'event',
	calendar_tasking: 'tasking',
	group: 'group',
	pinned_group: 'pinned group',
	ict_task: 'critical task',
	personnel_ict_completion: 'critical task completion',
	notification: 'notification',
	onboarding: 'onboarding',
	onboarding_template: 'onboarding template',
	onboarding_template_step: 'onboarding template step',
	'organization.rank_catalog': 'rank',
	'personnel.counseling_record': 'counseling record',
	'personnel.document': 'document',
	'personnel.follow_up': 'follow-up',
	'personnel.leader_note': 'leader note',
	rating_scheme: 'rating scheme entry',
	sign_in_roster: 'sign-in roster',
	special_day: 'Special Day',
	status_type: 'status type',
	training_type: 'training type',
	training_view: 'training view'
};

const VERBS: Record<string, string> = {
	created: 'Added',
	updated: 'Updated',
	deleted: 'Deleted',
	archived: 'Archived',
	restored: 'Restored',
	reordered: 'Reordered',
	duplicated: 'Duplicated',
	replaced: 'Replaced',
	saved: 'Saved',
	retired: 'Retired',
	reactivated: 'Reactivated',
	cancelled: 'Cancelled',
	completed: 'Completed',
	reopened: 'Reopened',
	started: 'Started',
	blocked: 'Blocked',
	unblocked: 'Unblocked'
};

function genericSentence(action: string, details: Details): string {
	const split = action.lastIndexOf('.');
	const noun = NOUNS[action.slice(0, split)];
	const verb = VERBS[action.slice(split + 1)];
	if (!noun || !verb) return `Recorded ${words(action)}`;
	const name = subject(details);
	if (name) return `${verb} ${noun} ${name}`;
	return `${verb} ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}

export function auditSentence(action: string, details: Details | null): string {
	const exact = SENTENCES[action];
	const safeDetails = details ?? {};
	if (exact) return typeof exact === 'string' ? exact : exact(safeDetails);
	for (const [pattern, sentence] of SENTENCE_PATTERNS) {
		const match = pattern.exec(action);
		if (match) return sentence(match);
	}
	return genericSentence(action, safeDetails);
}

export interface AuditEntryView {
	id: string;
	at: number;
	/** "YYYY-MM-DD" in the viewer's time zone. */
	day: string;
	clock: string;
	scope: AuditScope;
	area: string;
	sentence: string;
	/** The member's label, "Unknown member" when the member can no longer be named, or "System" for an entry with no actor. */
	actor: string;
	system: boolean;
}

export function viewAuditEntry(entry: AuditLogEntry, timeZone: string): AuditEntryView {
	const at = new Date(entry.createdAt);
	return {
		id: entry.id,
		at: at.getTime(),
		day: localDateIn(timeZone, at),
		clock: new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
			at
		),
		scope: auditScope(entry.action),
		area: auditArea(entry.action),
		sentence: auditSentence(entry.action, entry.details),
		actor: entry.actor?.trim() || (entry.userId ? 'Unknown member' : 'System'),
		system: !entry.actor?.trim() && !entry.userId
	};
}

function previousDay(day: string): string {
	const [year, month, date] = day.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, date - 1)).toISOString().slice(0, 10);
}

/**
 * The heading over one day's rows; `day` and `today` are "YYYY-MM-DD" in the viewer's time zone.
 * `cutOff` marks the oldest loaded day when older entries were not loaded, so its count is a floor.
 */
export function auditDayHead(
	day: string,
	today: string,
	count: number,
	{ cutOff = false } = {}
): { title: string; detail: string } {
	const entries = cutOff ? `${count.toLocaleString('en-US')}+ entries` : plural(count, 'entry', 'entries');
	const date =
		day.slice(0, 4) === today.slice(0, 4) ? formatDayMonth(day) : `${formatDayMonth(day)} ${day.slice(0, 4)}`;
	if (day === today) return { title: 'Today', detail: `${date} · ${entries}` };
	if (day === previousDay(today)) return { title: 'Yesterday', detail: `${date} · ${entries}` };
	return { title: date, detail: entries };
}
