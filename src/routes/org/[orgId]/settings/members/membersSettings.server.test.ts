import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessRequestSetupState } from '$features/identity/index.server';
import type { AuthContext, UseCaseContext } from '$lib/server/core/ports';
import { createTestContext } from '$lib/server/adapters/inMemory';
import type { SettingsAccessSourceRow } from '../settingsMemberAccessReadModel.server';
import {
	buildMembersSettingsSection,
	loadMembersSettings,
	type BuildMembersSettingsDataInput,
	type SettingsInvitationDeliverySourceRow
} from './membersSettings.server';

const NOW = new Date('2026-08-04T12:00:00Z');

const ALL_SETUP_STATES: AccessRequestSetupState[] = [
	'not_sent',
	'delivery_failed',
	'delivery_pending',
	'claimed',
	'pending',
	'expired',
	'replaced',
	'failed',
	'completed'
];

/** Delivery or setup is in progress; a held claim receives separate support guidance. */
const CREDENTIAL_IN_HAND_STATES: AccessRequestSetupState[] = ['pending', 'delivery_pending', 'claimed', 'replaced'];

/** The rest of the incomplete states: no credential the invitee can act on, one shared remedy. */
const NO_USABLE_CREDENTIAL_STATES: AccessRequestSetupState[] = ['delivery_failed', 'failed', 'not_sent', 'expired'];

const LOCKED_FUNNEL_LABELS = [
	'Invitation email failed',
	"Setup email didn't reach them",
	'Waiting on them',
	'Waiting on them to accept'
];

/**
 * The subset of setup states whose names are unique to the platform. The rest — `not_sent`,
 * `pending`, `expired`, `failed`, `completed` — collide with the organization's own invitation
 * and invitation-email vocabulary, so a whole-payload string search cannot tell them apart.
 * Those are covered instead by asserting every state collapses to a locked funnel label.
 */
const PLATFORM_ONLY_SETUP_VOCABULARY: AccessRequestSetupState[] = [
	'delivery_failed',
	'delivery_pending',
	'claimed',
	'replaced'
];

function invitationRow(overrides: Partial<SettingsAccessSourceRow> = {}): SettingsAccessSourceRow {
	return {
		id: 'invite-1',
		email: 'invitee@example.com',
		role: 'member',
		status: 'pending',
		created_at: '2026-08-01T09:00:00Z',
		expires_at: '2026-08-15T09:00:00Z',
		member_preset: 'editor',
		capability_overrides: {},
		access_scope_kind: 'organization',
		access_scope_group_ids: [],
		...overrides
	};
}

function memberRow(overrides: Partial<SettingsAccessSourceRow> = {}): SettingsAccessSourceRow {
	return {
		id: 'member-1',
		organization_id: 'org-1',
		user_id: 'user-1',
		email: 'member@example.com',
		role: 'member',
		created_at: '2026-07-01T09:00:00Z',
		member_preset: 'editor',
		capability_overrides: {},
		access_scope_kind: 'organization',
		access_scope_group_ids: [],
		...overrides
	};
}

function deliveryRow(
	overrides: Partial<SettingsInvitationDeliverySourceRow> = {}
): SettingsInvitationDeliverySourceRow {
	return {
		id: 'delivery-1',
		invitation_id: 'invite-1',
		status: 'sent',
		attempt_count: 1,
		last_error: null,
		updated_at: '2026-08-01T09:01:00Z',
		sent_at: '2026-08-01T09:01:00Z',
		...overrides
	};
}

function buildSection(overrides: Partial<BuildMembersSettingsDataInput> = {}) {
	return buildMembersSettingsSection({
		currentMemberRole: 'owner',
		canManageMembers: true,
		isAdmin: true,
		members: [],
		invitations: [invitationRow()],
		invitationDeliveries: [deliveryRow()],
		groups: [],
		now: NOW,
		...overrides
	});
}

function onlyInvitation(overrides: Partial<BuildMembersSettingsDataInput> = {}) {
	const section = buildSection(overrides);
	expect(section.invitations).toHaveLength(1);
	return section.invitations[0];
}

describe('members settings invitation funnel status', () => {
	it('reports an invitation-email failure', () => {
		const invitation = onlyInvitation({
			invitationDeliveries: [deliveryRow({ status: 'failed', last_error: 'smtp refused' })]
		});

		expect(invitation.funnelStatus).toBe('invitation_email_failed');
		expect(invitation.funnelStatusLabel).toBe('Invitation email failed');
	});

	it('reports a setup-email failure once the invitation email went out', () => {
		const invitation = onlyInvitation({
			invitationSetupStates: new Map([['invite-1', 'delivery_failed']])
		});

		expect(invitation.funnelStatus).toBe('setup_email_failed');
		expect(invitation.funnelStatusLabel).toBe("Setup email didn't reach them");
	});

	it('points a failed setup email at the recovery link the invitation email carries', () => {
		const invitation = onlyInvitation({
			invitationSetupStates: new Map([['invite-1', 'delivery_failed']])
		});

		expect(invitation.funnelStatusDetail).toContain("Didn't get your setup link?");
	});

	it('ranks an invitation-email failure above a setup-email failure', () => {
		const invitation = onlyInvitation({
			invitationDeliveries: [deliveryRow({ status: 'failed' })],
			invitationSetupStates: new Map([['invite-1', 'delivery_failed']])
		});

		expect(invitation.funnelStatusLabel).toBe('Invitation email failed');
	});

	it.each<AccessRequestSetupState>(CREDENTIAL_IN_HAND_STATES)(
		'keeps the invitation pending during the %s setup state',
		(setupState) => {
			const invitation = onlyInvitation({
				invitationSetupStates: new Map([['invite-1', setupState]])
			});

			expect(invitation.funnelStatus).toBe('waiting_on_them');
			expect(invitation.funnelStatusLabel).toBe('Waiting on them');
		}
	);

	it('points a claimed setup at Platform support while preserving the separate invitation resend', () => {
		const invitation = onlyInvitation({
			invitationSetupStates: new Map([['invite-1', 'claimed']])
		});

		expect(invitation.funnelStatus).toBe('waiting_on_them');
		expect(invitation.funnelStatusDetail).toContain('contact Platform support');
		expect(invitation.funnelStatusDetail).toContain('Resending the invitation will not unlock');
		expect(invitation.canResend).toBe(true);
	});

	it.each<AccessRequestSetupState>(NO_USABLE_CREDENTIAL_STATES)(
		'points the admin at the recovery link when the %s setup state leaves no usable link',
		(setupState) => {
			const invitation = onlyInvitation({
				invitationSetupStates: new Map([['invite-1', setupState]])
			});

			expect(invitation.funnelStatus).toBe('setup_email_failed');
			expect(invitation.funnelStatusLabel).toBe("Setup email didn't reach them");
			expect(invitation.funnelStatusDetail).toContain("Didn't get your setup link?");
		}
	);

	it('never tells an admin both emails went out when no setup email did', () => {
		const invitation = onlyInvitation({
			invitationSetupStates: new Map([['invite-1', 'not_sent']])
		});

		expect(invitation.funnelStatusLabel).not.toBe('Waiting on them');
	});

	it('accounts for every setup state, so a new one cannot fall through unclassified', () => {
		expect(new Set([...CREDENTIAL_IN_HAND_STATES, ...NO_USABLE_CREDENTIAL_STATES, 'completed'])).toEqual(
			new Set(ALL_SETUP_STATES)
		);
	});

	it('waits on acceptance once setup is complete', () => {
		const invitation = onlyInvitation({
			invitationSetupStates: new Map([['invite-1', 'completed']])
		});

		expect(invitation.funnelStatus).toBe('waiting_on_them_to_accept');
		expect(invitation.funnelStatusLabel).toBe('Waiting on them to accept');
	});

	it('waits on acceptance when the invitee already had an account, rather than going blank', () => {
		const invitation = onlyInvitation({ invitationSetupStates: new Map() });

		expect(invitation.funnelStatus).toBe('waiting_on_them_to_accept');
		expect(invitation.funnelStatusLabel).toBe('Waiting on them to accept');
	});

	it('waits on acceptance when no setup-state lookup is available at all', () => {
		const invitation = onlyInvitation({ invitationSetupStates: undefined });

		expect(invitation.funnelStatusLabel).toBe('Waiting on them to accept');
	});

	it('gives every combination of email and setup state one of the four locked labels', () => {
		const setupStates: Array<AccessRequestSetupState | undefined> = [undefined, ...ALL_SETUP_STATES];
		const labels = new Set(
			setupStates.flatMap((setupState) =>
				(['sent', 'pending', 'failed', 'not_sent'] as const).map(
					(deliveryStatus) =>
						onlyInvitation({
							invitationDeliveries: deliveryStatus === 'not_sent' ? [] : [deliveryRow({ status: deliveryStatus })],
							invitationSetupStates: setupState ? new Map([['invite-1', setupState]]) : new Map()
						}).funnelStatusLabel
				)
			)
		);

		expect(labels).toEqual(new Set(LOCKED_FUNNEL_LABELS));
	});

	it('keeps resend available in every state', () => {
		for (const setupState of ALL_SETUP_STATES) {
			const invitation = onlyInvitation({
				invitationDeliveries: [deliveryRow({ status: 'failed' })],
				invitationSetupStates: new Map([['invite-1', setupState]])
			});

			expect(invitation.canResend).toBe(true);
		}
	});

	it('keeps platform setup-state vocabulary out of the shaped section', () => {
		for (const setupState of PLATFORM_ONLY_SETUP_VOCABULARY) {
			const section = buildSection({ invitationSetupStates: new Map([['invite-1', setupState]]) });

			expect(JSON.stringify(section)).not.toContain(setupState);
		}
	});

	it('leaves closed invitations out of the funnel entirely', () => {
		const section = buildSection({
			invitations: [invitationRow({ id: 'invite-1', status: 'revoked', revoked_at: '2026-08-02T09:00:00Z' })],
			invitationSetupStates: new Map()
		});

		expect(section.invitations).toHaveLength(0);
		expect(section.invitationHistory).toHaveLength(1);
		expect(section.invitationHistory[0]).not.toHaveProperty('funnelStatusLabel');
	});

	it('carries no renew URL onto the invitation row', () => {
		const section = buildSection({ invitationSetupStates: new Map([['invite-1', 'delivery_failed']]) });

		expect(JSON.stringify(section)).not.toContain('/auth/renew-invite');
	});
});

function makeLoadContext(
	lookup: UseCaseContext['organizationInvitationSetupStateLookup']
): Parameters<typeof loadMembersSettings>[0] {
	const rowsByTable: Record<string, unknown[]> = {
		organization_memberships: [memberRow()],
		organization_invitations: [invitationRow()],
		organization_invitation_email_outbox: [deliveryRow()],
		groups: [],
		deletion_requests: []
	};

	return {
		auth: { orgId: 'org-1', role: 'owner', canManageMembers: true } as AuthContext,
		store: {
			findMany: vi.fn(async (table: string) => rowsByTable[table] ?? [])
		} as unknown as UseCaseContext['store'],
		organizationInvitationSetupStateLookup: lookup
	};
}

describe('members settings setup-state lookup degradation', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('still renders the members screen when the setup-state lookup fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const context = makeLoadContext({
			findSetupStateByInvitationId: vi.fn().mockRejectedValue(new Error('service role unavailable'))
		});

		const data = await loadMembersSettings(context, { isAdmin: true });

		expect(data.sections.members.invitations).toHaveLength(1);
		expect(LOCKED_FUNNEL_LABELS).toContain(data.sections.members.invitations[0].funnelStatusLabel);
	});

	it('keeps reporting the invitation-email stage when the setup-state lookup fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const context = makeLoadContext({
			findSetupStateByInvitationId: vi.fn().mockRejectedValue(new Error('service role unavailable'))
		});
		vi.mocked(context.store.findMany).mockImplementation(async (table: string) =>
			table === 'organization_memberships'
				? [memberRow()]
				: table === 'organization_invitations'
					? [invitationRow()]
					: table === 'organization_invitation_email_outbox'
						? [deliveryRow({ status: 'failed' })]
						: []
		);

		const data = await loadMembersSettings(context, { isAdmin: true });

		expect(data.sections.members.invitations[0].funnelStatusLabel).toBe('Invitation email failed');
	});

	it('reads platform setup state when the lookup is available', async () => {
		const context = makeLoadContext({
			findSetupStateByInvitationId: vi.fn().mockResolvedValue(new Map([['invite-1', 'delivery_failed']]))
		});

		const data = await loadMembersSettings(context, { isAdmin: true });

		expect(data.sections.members.invitations[0].funnelStatusLabel).toBe("Setup email didn't reach them");
	});
});

describe('members settings section shaping', () => {
	it('offers every same-Organization Group in saved order', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		ctx.store.seed('groups', [
			{ id: 'g2', organization_id: 'org-1', name: 'Bravo', sort_order: 2 },
			{ id: 'g1', organization_id: 'org-1', name: 'Alpha', sort_order: 1 },
			{ id: 'foreign', organization_id: 'other-org', name: 'Foreign', sort_order: 0 }
		]);

		const data = await loadMembersSettings(ctx, { isAdmin: true });

		expect(data.sections.members.groups).toEqual([
			{ id: 'g1', name: 'Alpha' },
			{ id: 'g2', name: 'Bravo' }
		]);
	});

	it('splits actionable invitations from closed history', () => {
		const section = buildSection({
			invitations: [
				invitationRow({ id: 'invite-pending' }),
				invitationRow({ id: 'invite-revoked', status: 'revoked', revoked_at: '2026-08-02T09:00:00Z' }),
				invitationRow({ id: 'invite-lapsed', expires_at: '2026-08-03T09:00:00Z' })
			],
			invitationDeliveries: []
		});

		expect(section.invitations.map((invitation) => invitation.id)).toEqual(['invite-pending']);
		expect(section.invitationHistory.map((invitation) => invitation.lifecycleStatusLabel)).toEqual([
			'Revoked',
			'Expired'
		]);
	});

	it('summarizes membership roles and pending approvals', () => {
		const section = buildSection({
			members: [
				memberRow({ id: 'member-owner', user_id: 'user-1', email: 'owner@example.com', role: 'owner' }),
				memberRow({ id: 'member-admin', user_id: 'user-2', email: 'admin@example.com', role: 'admin' }),
				memberRow({ id: 'member-1', user_id: 'user-3', email: 'member@example.com', role: 'member' })
			],
			approvalRequests: [
				{ id: 'request-1', status: 'pending', created_at: '2026-07-30T09:00:00Z' },
				{ id: 'request-2', status: 'pending', created_at: '2026-07-28T09:00:00Z' },
				{ id: 'request-3', status: 'approved', created_at: '2026-07-01T09:00:00Z' }
			] as BuildMembersSettingsDataInput['approvalRequests']
		});

		expect(section.roleCounts).toEqual({ owner: 1, admin: 1, member: 1 });
		expect(section.memberRoleSummary).toBe('1 Owner · 1 Admin · 1 Member');
		expect(section.pendingApprovalSummary).toEqual({ count: 2, oldestCreatedAt: '2026-07-28T09:00:00Z' });
	});

	it('withholds invite and access management from members who cannot manage members', () => {
		const section = buildSection({ currentMemberRole: 'member', canManageMembers: false, isAdmin: false });

		expect(section.canInvite).toBe(false);
		expect(section.canManageMemberAccess).toBe(false);
	});
});
