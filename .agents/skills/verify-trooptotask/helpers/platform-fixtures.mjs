import { randomUUID } from 'node:crypto';

const checked = (result) => {
	if (result.error) throw new Error('Owned platform fixture failed: ' + result.error.message);
	return result.data;
};

const PLATFORM_USER_AUDIT_ACTIONS = [
	'suspend_user',
	'unsuspend_user',
	'admin.user.password_reset',
	'admin.user.resend_invite'
];

// Store every target before inserting. No original Organization or access request is changed.
export async function seedPlatform({ client, fixture, tag, ownedState, save }) {
	if (ownedState.platform) throw new Error('Clean the existing platform seed first.');
	const organization = {
		id: randomUUID(),
		name: `Platform verification ${tag}`,
		created_by: fixture.actors.orgCreator.id
	};
	const requests = Object.fromEntries(
		['approve', 'reject', 'completed'].map((key) => [
			key,
			{
				id: randomUUID(),
				email: `platform-${key}-${tag}@example.test`,
				name: `Platform ${key} ${tag}`,
				status: key === 'completed' ? 'approved' : 'pending',
				...(key === 'completed'
					? { approval_basis: 'platform_review', setup_completed_at: new Date().toISOString() }
					: {})
			}
		])
	);
	const invitation = {
		id: randomUUID(),
		organization_id: organization.id,
		email: requests.reject.email,
		invited_by: fixture.actors.orgCreator.id,
		role: 'member',
		member_preset: 'viewer',
		access_scope_kind: 'organization',
		access_scope_group_ids: [],
		status: 'pending'
	};
	const link = {
		id: randomUUID(),
		access_request_id: requests.reject.id,
		organization_invitation_id: invitation.id,
		organization_id: organization.id,
		invited_by: invitation.invited_by,
		invited_at: new Date().toISOString(),
		intended_membership_role: 'member',
		intended_member_preset: 'viewer',
		intended_access_scope_kind: 'organization'
	};
	const memberships = ['orgCreator', 'orgInvitee', 'orgMember'].map((role, index) => ({
		id: randomUUID(),
		organization_id: organization.id,
		user_id: fixture.actors[role].id,
		email: fixture.actors[role].email,
		role: index === 0 ? 'owner' : 'member',
		member_preset: 'viewer',
		access_scope_kind: 'organization',
		access_scope_group_ids: []
	}));
	// An unconfirmed account is the only one whose User detail offers Resend Invite.
	const pendingUser = { id: randomUUID(), email: `platform-pending-${tag}@example.test` };
	ownedState.platform = {
		organization,
		requests,
		invitation,
		link,
		memberships,
		pendingUser,
		seededAt: new Date().toISOString()
	};
	await save(ownedState);
	checked(await client.from('organizations').insert(organization));
	checked(await client.from('organization_memberships').insert(memberships));
	checked(await client.from('access_requests').insert(Object.values(requests)));
	checked(await client.from('organization_invitations').insert(invitation));
	checked(await client.from('access_request_organization_invitation_links').insert(link));
	checked(await client.auth.admin.createUser({ ...pendingUser, email_confirm: false }));
	return { ...ownedState.platform, boundary: 'Privileged synthetic prerequisites; no UI or authorization proof.' };
}

// Thirty extra Organizations put the Organizations index past one 25-row page. Clean-seeds deletes them by recorded ID.
export async function seedOrganizationPages({ client, fixture, tag, ownedState, save }) {
	if (ownedState.seeded.some((item) => item.kind === 'organization-pages'))
		throw new Error('Clean the existing Organization paging seed before preparing another cohort.');
	const rows = Array.from({ length: 30 }, (_, index) => ({
		id: randomUUID(),
		name: `Paging verification ${tag} ${String(index + 1).padStart(2, '0')}`,
		created_by: fixture.actors.orgCreator.id
	}));
	ownedState.seeded.push({ kind: 'organization-pages', table: 'organizations', tag, ids: rows.map(({ id }) => id) });
	await save(ownedState);
	checked(await client.from('organizations').insert(rows));
	return { tag, names: rows.map(({ name }) => name), boundary: 'Privileged synthetic prerequisites; no UI proof.' };
}

// Stored Activity events across every category, severity and day, with one legacy row that carries IDs only.
// Clean-seeds deletes them by recorded ID. The 55 filler events put Activity past one 50-row page.
export async function seedPlatformActivity({ client, fixture, tag, ownedState, save }) {
	if (ownedState.seeded.some((item) => item.kind === 'platform-activity'))
		throw new Error('Clean the existing platform Activity seed before preparing another cohort.');
	const operator = fixture.actors.platformReviewer;
	const hour = 60 * 60 * 1000;
	const start = Date.now() - hour;
	const event = (hoursAgo, action, severity, fields) => ({
		id: randomUUID(),
		user_id: operator.id,
		action,
		severity,
		timestamp: new Date(start - hoursAgo * hour).toISOString(),
		details: {},
		...fields
	});
	const labels = (targetName, more = {}) => ({ actorEmail: operator.email, targetName, ...more });
	const named = [
		event(0, 'suspend_org', 'critical', {
			org_id: fixture.ids.orgA,
			resource_type: 'organization',
			resource_id: fixture.ids.orgA,
			details: labels(`Activity verification ${tag}`, { reason: `Synthetic hold ${tag}` })
		}),
		event(1, 'access_request.approved', 'info', {
			resource_type: 'access_request',
			resource_id: randomUUID(),
			details: labels(`Applicant ${tag}`)
		}),
		event(2, 'access_request.rejection_authorization_denied', 'warning', {
			resource_type: 'access_request',
			resource_id: randomUUID(),
			details: labels(`Applicant ${tag}`)
		}),
		event(3, 'suspend_user', 'critical', {
			resource_type: 'user',
			resource_id: fixture.actors.orgMember.id,
			details: { reason: `Legacy row ${tag}` },
			user_id: null
		}),
		event(5, 'unsuspend_user', 'warning', {
			resource_type: 'user',
			resource_id: fixture.actors.orgMember.id,
			details: labels(fixture.actors.orgMember.email)
		}),
		event(8, 'admin.org.transfer_ownership', 'critical', {
			org_id: fixture.ids.orgA,
			resource_type: 'organization',
			resource_id: fixture.ids.orgA,
			details: labels(`Activity verification ${tag}`, {
				fromUserId: fixture.actors.orgCreator.id,
				toUserId: fixture.actors.orgMember.id
			})
		}),
		event(9, 'auth.login_failure', 'warning', { resource_type: 'user', resource_id: operator.id }),
		event(30, 'admin.brand.new', 'info', { resource_type: 'user', resource_id: operator.id }),
		event(31, 'announcement_create', 'info', {
			resource_type: 'platform_announcement',
			resource_id: randomUUID(),
			details: labels(`Notice ${tag}`)
		})
	];
	const filler = Array.from({ length: 55 }, (_, index) =>
		event(40 + index * 6, 'admin.user.resend_invite', 'info', {
			resource_type: 'user',
			resource_id: fixture.actors.orgInvitee.id,
			details: labels(`Filler ${tag} ${String(index + 1).padStart(2, '0')}`)
		})
	);
	const rows = [...named, ...filler];
	ownedState.seeded.push({ kind: 'platform-activity', table: 'audit_logs', tag, ids: rows.map(({ id }) => id) });
	await save(ownedState);
	checked(await client.from('audit_logs').insert(rows));
	return {
		tag,
		operatorEmail: operator.email,
		organization: `Activity verification ${tag}`,
		legacyId: named[3].id,
		total: rows.length,
		boundary: 'Privileged stored-event setup; real producer and ordinary disclosure proof remain separate.'
	};
}

export async function readPlatform({ client, fixture, ownedState }) {
	const seed = ownedState.platform;
	if (!seed) throw new Error('Seed platform-admin first.');
	const requestIds = Object.values(seed.requests).map(({ id }) => id);
	const userIds = seed.memberships.map(({ user_id }) => user_id);
	const pendingUserIds = seed.pendingUser ? [seed.pendingUser.id] : [];
	// Reused fixture Users retain unrelated Identity history from the same run.
	const auditFilters = [
		`org_id.eq.${seed.organization.id}`,
		`resource_id.in.(${[seed.organization.id, ...requestIds, ...pendingUserIds].join(',')})`,
		...(userIds.length
			? [`and(resource_id.in.(${userIds.join(',')}),action.in.(${PLATFORM_USER_AUDIT_ACTIONS.join(',')}))`]
			: [])
	];
	const users = Object.fromEntries(
		['orgCreator', 'orgInvitee', 'orgMember'].map((role) => [
			role,
			{
				id: fixture.actors[role].id,
				email: fixture.actors[role].email
			}
		])
	);
	if (seed.pendingUser) users.pendingUser = seed.pendingUser;
	return {
		users,
		organization: checked(
			await client.from('organizations').select('id,name,created_by,suspended_at').eq('id', seed.organization.id)
		),
		memberships: checked(
			await client
				.from('organization_memberships')
				.select(
					'id,organization_id,user_id,email,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids'
				)
				.eq('organization_id', seed.organization.id)
		),
		requests: checked(
			await client
				.from('access_requests')
				.select('id,email,name,status,reviewed_by,reviewed_at,setup_user_id,setup_completed_at')
				.in('id', requestIds)
		),
		setupLinks: checked(
			await client
				.from('account_setup_links')
				.select('id,access_request_id,created_at,expires_at,used_at,revoked_at')
				.in('access_request_id', requestIds)
		),
		deliveries: checked(
			await client
				.from('auth_email_outbox')
				.select('id,access_request_id,setup_link_id,status,attempt_count,sent_at')
				.in('access_request_id', requestIds)
		),
		invitations: checked(
			await client
				.from('organization_invitations')
				.select('id,organization_id,email,status,blocked_at')
				.eq('id', seed.invitation.id)
		),
		links: checked(
			await client
				.from('access_request_organization_invitation_links')
				.select('id,access_request_id,organization_invitation_id,organization_id')
				.eq('id', seed.link.id)
		),
		suspensions: checked(
			await client
				.from('user_suspensions')
				.select('user_id,suspended_by,reason')
				.in(
					'user_id',
					Object.values(users).map(({ id }) => id)
				)
		),
		audit: checked(
			await client
				.from('audit_logs')
				.select('id,action,org_id,user_id,resource_id,timestamp')
				.or(auditFilters.join(','))
				.gte('timestamp', seed.seededAt)
		),
		boundary: 'Privileged exact-target provider readback; distinct from native/ordinary HTTP proof.'
	};
}

// Explicitly record observed User operation events; ambient history grants no deletion authority.
export async function recordPlatformUserAudit({ client, ownedState, ids, save }) {
	const seed = ownedState.platform;
	if (!seed) throw new Error('Seed platform-admin first.');
	if (
		!Array.isArray(ids) ||
		!ids.length ||
		ids.some(
			(id) => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
		)
	)
		throw new Error('Use exact observed audit UUIDs.');
	const selectedIds = [...new Set(ids)];
	const rows = checked(
		await client
			.from('audit_logs')
			.select('id,action,resource_id,timestamp')
			.in('id', selectedIds)
			.in(
				'resource_id',
				seed.memberships.map(({ user_id }) => user_id)
			)
			.in('action', PLATFORM_USER_AUDIT_ACTIONS)
			.gte('timestamp', seed.seededAt)
	);
	if (rows.length !== selectedIds.length || rows.some((row) => !selectedIds.includes(row.id)))
		throw new Error('Every recorded event must be a current Platform operation on a seeded User.');
	seed.userAuditIds = [...new Set([...(seed.userAuditIds ?? []), ...selectedIds])];
	await save(ownedState);
	return {
		recordedUserAuditIds: selectedIds,
		boundary: 'Explicitly observed operation IDs; no ambient User history is owned.'
	};
}

export async function cleanPlatform({ client, fixture, ownedState, save }) {
	const seed = ownedState.platform;
	if (!seed) return;
	// Restore User suspension through the UI first. Cleanup cannot silently repair product state.
	const suspended = checked(
		await client
			.from('user_suspensions')
			.select('user_id')
			.in(
				'user_id',
				seed.memberships.map(({ user_id }) => user_id)
			)
	);
	if (suspended.length) throw new Error('Restore platform seed User suspensions before cleanup.');
	const before = await readPlatform({ client, fixture, ownedState });
	const ownedResources = [
		seed.organization.id,
		...Object.values(seed.requests).map(({ id }) => id),
		...(seed.pendingUser ? [seed.pendingUser.id] : [])
	];
	seed.auditIds = [
		...new Set([
			...(seed.auditIds ?? []),
			...(seed.userAuditIds ?? []),
			...before.audit
				.filter((row) => row.org_id === seed.organization.id || ownedResources.includes(row.resource_id))
				.map(({ id }) => id)
		])
	];
	await save(ownedState);
	if (seed.auditIds.length) checked(await client.from('audit_logs').delete().in('id', seed.auditIds));
	checked(
		await client
			.from('access_requests')
			.delete()
			.in(
				'id',
				Object.values(seed.requests).map(({ id }) => id)
			)
	);
	checked(await client.from('organizations').delete().eq('id', seed.organization.id));
	if (seed.pendingUser) {
		const removed = await client.auth.admin.deleteUser(seed.pendingUser.id);
		if (removed.error && removed.error.status !== 404) checked(removed);
	}
	const after = await readPlatform({ client, fixture, ownedState });
	const retainedAudit = seed.auditIds.length
		? checked(await client.from('audit_logs').select('id,org_id').in('id', seed.auditIds))
		: [];
	if (
		retainedAudit.length ||
		after.audit.some((row) => row.org_id === seed.organization.id || ownedResources.includes(row.resource_id))
	)
		throw new Error('Platform seed cleanup left recorded audit rows.');
	after.removedAuditIds = seed.auditIds;
	after.retainedUserAuditIds = after.audit.map(({ id }) => id);
	if (
		['organization', 'memberships', 'requests', 'setupLinks', 'deliveries', 'invitations', 'links'].some(
			(key) => after[key].length
		)
	)
		throw new Error('Platform seed cleanup left tracked rows.');
	delete ownedState.platform;
	await save(ownedState);
	return after;
}
