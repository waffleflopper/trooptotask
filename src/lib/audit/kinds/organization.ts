import { z } from 'zod';
import { auditKind, plural, savedLabel } from './shared';

const named = z.object({ record: savedLabel, details: z.object({}) });
const withRole = z.object({ record: savedLabel, details: z.object({ role: savedLabel }) });
const nothing = z.object({ details: z.object({}) });
const count = z.number().int().positive();

function request(verb: string) {
	return auditKind({
		writer: 'app',
		entry: z.object({ record: savedLabel, details: z.object({ resourceType: savedLabel }) }),
		sentence: ({ record, details }) =>
			`${verb} ${details.resourceType === 'personnel' ? 'archive' : 'deletion'} of ${record}`,
		batch: { verb, one: 'deletion request', many: 'deletion requests' }
	});
}

function roster(verb: string) {
	return auditKind({
		writer: 'app',
		entry: named,
		sentence: ({ record }) => `${verb} sign-in roster ${record}`,
		batch: { verb, one: 'sign-in roster', many: 'sign-in rosters' }
	});
}

export const organizationKinds = {
	'member.invite': auditKind({
		writer: 'app',
		entry: withRole,
		sentence: ({ record, details }) => `Invited ${record} as ${details.role}`,
		batch: { verb: 'Invited', one: 'member', many: 'members' }
	}),
	'member.invite_revoked': auditKind({
		writer: 'app',
		entry: named,
		sentence: ({ record }) => `Revoked the invitation for ${record}`,
		batch: { verb: 'Revoked', one: 'invitation', many: 'invitations' }
	}),
	'member.removed': auditKind({
		writer: 'app',
		entry: named,
		sentence: ({ record }) => `Removed ${record} from the unit`,
		batch: { verb: 'Removed', one: 'member', many: 'members' }
	}),
	'member.left': auditKind({
		writer: 'app',
		entry: nothing,
		sentence: () => 'Left the unit',
		batch: { verb: 'Left', one: 'unit', many: 'units' }
	}),
	'member.access_changed': auditKind({
		writer: 'app',
		entry: withRole,
		sentence: ({ record, details }) => `Changed access for ${record} to ${details.role}`,
		batch: { verb: 'Changed access for', one: 'member', many: 'members' }
	}),
	'organization_invitation.accepted': auditKind({
		writer: 'app',
		entry: nothing,
		sentence: () => 'Accepted an invitation to the unit',
		batch: { verb: 'Accepted', one: 'invitation', many: 'invitations' }
	}),
	'org.renamed': auditKind({
		writer: 'app',
		entry: named,
		sentence: ({ record }) => `Renamed the unit to ${record}`,
		batch: { verb: 'Renamed', one: 'unit', many: 'units' }
	}),
	'org.url_slug_updated': auditKind({
		writer: 'app',
		entry: named,
		sentence: ({ record }) => `Changed the web address to ${record}`,
		batch: { verb: 'Changed the web address of', one: 'unit', many: 'units' }
	}),
	'org.url_slug_cleared': auditKind({
		writer: 'app',
		entry: nothing,
		sentence: () => 'Cleared the web address',
		batch: { verb: 'Cleared the web address of', one: 'unit', many: 'units' }
	}),
	'org.ownership_transferred': auditKind({
		writer: 'app',
		entry: named,
		sentence: ({ record }) => `Transferred unit ownership to ${record}`,
		batch: { verb: 'Transferred ownership of', one: 'unit', many: 'units' }
	}),
	'deletion_request.created': request('Requested'),
	'deletion_request.approved': request('Approved'),
	'deletion_request.denied': request('Denied'),
	'deletion_request.cancelled': request('Cancelled'),
	'sign_in_roster.created': roster('Created'),
	'sign_in_roster.deleted': roster('Deleted'),
	'sign_in_roster.scan_uploaded': auditKind({
		writer: 'app',
		entry: named,
		sentence: ({ record }) => `Uploaded a signed scan for sign-in roster ${record}`,
		batch: { verb: 'Uploaded a signed scan for', one: 'sign-in roster', many: 'sign-in rosters' }
	}),
	'critical_tasks.defaults_updated': auditKind({
		writer: 'app',
		entry: z.object({
			details: z.object({
				defaultExpirationMonths: z.number().int().nullable(),
				expiringSoonWarningDays: z.number().int().nullable()
			})
		}),
		sentence: ({ details }) =>
			`Changed the critical task defaults: ${
				details.defaultExpirationMonths === null
					? 'no default expiration'
					: `expire after ${plural(details.defaultExpirationMonths, 'month', 'months')}`
			}, ${
				details.expiringSoonWarningDays === null
					? 'no warning window'
					: `warn ${plural(details.expiringSoonWarningDays, 'day', 'days')} before`
			}`,
		batch: { verb: 'Changed', one: 'set of critical task defaults', many: 'sets of critical task defaults' }
	}),
	'organization.rank_catalog.saved': auditKind({
		writer: 'app',
		entry: z.object({ record: savedLabel, details: z.object({ code: savedLabel, state: savedLabel }) }),
		sentence: ({ record, details }) => `Saved rank ${record} (${details.state})`,
		batch: { verb: 'Saved', one: 'rank', many: 'ranks' }
	}),
	'organization.rank_catalog.bulk_state_changed': auditKind({
		writer: 'app',
		entry: z.object({ details: z.object({ count, targetState: savedLabel.nullable() }) }),
		sentence: ({ details }) =>
			`Changed the state of ${plural(details.count, 'rank', 'ranks')}${details.targetState ? ` to ${details.targetState}` : ''}`,
		batch: { verb: 'Changed the state of', one: 'rank', many: 'ranks' }
	}),
	'organization.rank_catalog.deleted': auditKind({
		writer: 'app',
		entry: z.object({ record: savedLabel, details: z.object({ code: savedLabel }) }),
		sentence: ({ record }) => `Deleted rank ${record}`,
		batch: { verb: 'Deleted', one: 'rank', many: 'ranks' }
	})
} as const;
