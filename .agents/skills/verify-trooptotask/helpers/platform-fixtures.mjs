import { randomUUID } from 'node:crypto';

const checked = (result) => {
	if (result.error) throw new Error('Owned platform fixture failed: ' + result.error.message);
	return result.data;
};

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
				...(key === 'completed' ? { setup_completed_at: new Date().toISOString() } : {})
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
	ownedState.platform = { organization, requests, invitation, link, memberships, seededAt: new Date().toISOString() };
	await save(ownedState);
	checked(await client.from('organizations').insert(organization));
	checked(await client.from('organization_memberships').insert(memberships));
	checked(await client.from('access_requests').insert(Object.values(requests)));
	checked(await client.from('organization_invitations').insert(invitation));
	checked(await client.from('access_request_organization_invitation_links').insert(link));
	return { ...ownedState.platform, boundary: 'Privileged synthetic prerequisites; no UI or authorization proof.' };
}

export async function readPlatform({ client, fixture, ownedState }) {
	const seed = ownedState.platform;
	if (!seed) throw new Error('Seed platform-admin first.');
	const requestIds = Object.values(seed.requests).map(({ id }) => id);
	const users = Object.fromEntries(
		['orgCreator', 'orgInvitee', 'orgMember'].map((role) => [
			role,
			{
				id: fixture.actors[role].id,
				email: fixture.actors[role].email
			}
		])
	);
	return {
		users,
		organization: checked(
			await client.from('organizations').select('id,name,created_by,suspended_at').eq('id', seed.organization.id)
		),
		memberships: checked(
			await client
				.from('organization_memberships')
				.select('id,organization_id,user_id,email,role')
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
				.or(
					`org_id.eq.${seed.organization.id},resource_id.in.(${[seed.organization.id, ...requestIds, ...seed.memberships.map(({ user_id }) => user_id)].join(',')})`
				)
				.gte('timestamp', seed.seededAt)
		),
		boundary: 'Privileged exact-target provider readback; distinct from native/ordinary HTTP proof.'
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
	seed.auditIds = [...new Set([...(seed.auditIds ?? []), ...before.audit.map(({ id }) => id)])];
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
	const after = await readPlatform({ client, fixture, ownedState });
	const retainedAudit = seed.auditIds.length
		? checked(await client.from('audit_logs').select('id,org_id').in('id', seed.auditIds))
		: [];
	if (retainedAudit.length) throw new Error('Platform seed cleanup left recorded audit rows.');
	after.removedAuditIds = seed.auditIds;
	if (
		['organization', 'memberships', 'requests', 'setupLinks', 'deliveries', 'invitations', 'links', 'audit'].some(
			(key) => after[key].length
		)
	)
		throw new Error('Platform seed cleanup left tracked rows.');
	delete ownedState.platform;
	await save(ownedState);
	return after;
}
