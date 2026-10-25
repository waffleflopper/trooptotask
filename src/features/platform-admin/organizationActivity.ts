import type { PlatformOrganizationActivityEvent } from './organizationSupportTypes';

/** What a member did, written to follow the actor's name. Slice 6's shared registry replaces this table. */
const MEMBER_ACTIONS: Record<string, string> = {
	'person.created': 'added a Personnel Record',
	'personnel.create': 'added a Personnel Record',
	'personnel.created': 'added a Personnel Record',
	'personnel.updated': 'updated a Personnel Record',
	'personnel.archived': 'archived a Personnel Record',
	'personnel.restored': 'restored a Personnel Record',
	'personnel.permanently_deleted': 'permanently deleted a Personnel Record',
	'personnel.group_changed': "changed a person's Group",
	'personnel.exported': 'exported Personnel',
	'training.updated': 'updated a training record',
	'training_record.updated': 'updated a training record',
	'training.bulk_imported': 'imported training records',
	'member.invite': 'invited a member',
	'member.removed': 'removed a member',
	'member.access_changed': "changed a member's access",
	'organization_invitation.accepted': 'accepted an invitation',
	'organization_invitation.declined': 'declined an invitation',
	'org.renamed': 'renamed the Organization',
	'org.url_slug_updated': "changed the Organization's web address",
	'organization.settings_updated': "changed the Organization's settings",
	'org.ownership_transferred': 'transferred ownership of the Organization',
	'sign_in_roster.created': 'created a sign-in roster',
	'sign_in_roster.deleted': 'deleted a sign-in roster',
	'status_type.created': 'added a status type',
	'daily_assignment.updated': 'updated a daily assignment',
	'onboarding.started': 'started an onboarding',
	'onboarding.completed': 'completed an onboarding',
	'export.created': 'exported data',
	'export.excel_created': 'exported data to Excel',
	'policy.denied': 'was refused an action they lack access to'
};

/** What the platform did to the Organization, written as the whole sentence. */
const PLATFORM_ACTIONS: Record<string, string> = {
	suspend_org: 'A platform operator suspended the Organization',
	unsuspend_org: 'A platform operator lifted the Organization suspension',
	'admin.org.gift_tier': 'A platform operator changed the Organization plan'
};

export function describeAuditEvent(
	event: Pick<PlatformOrganizationActivityEvent, 'action' | 'userId'>,
	memberEmails: ReadonlyMap<string, string | null>
): string {
	const platform = PLATFORM_ACTIONS[event.action];
	if (platform) return platform;
	const actor = event.userId === null ? 'The system' : (memberEmails.get(event.userId) ?? 'Someone who has since left');
	const member = MEMBER_ACTIONS[event.action];
	return member ? `${actor} ${member}` : `${actor} recorded ${event.action}`;
}
