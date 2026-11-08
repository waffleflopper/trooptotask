import { formatDayMonth, formatDayOffset } from '$lib/utils/dates';
import { toDayNumber } from '$lib/utils/dayNumber';
import type { ApprovalAttention, InvitationAttention } from '$features/organization/contracts';
import type { DashboardInputs } from './dashboardInputs';
import type { NeedsYouLoad, NeedsYouSource } from './dashboardSections';
import type { NeedsYouItem } from './needsYou';
import { orgPath, plural } from './needsYouSources';

const APPROVAL_NOUN = {
	archive: ['archive request', 'archive requests'],
	deletion: ['deletion request', 'deletion requests']
} as const;

function daysBetween(from: string, to: string): number {
	return toDayNumber(to) - toDayNumber(from);
}

/** The calendar day an instant falls on for the viewer, "YYYY-MM-DD". */
function viewerDay(timeZone: string, instant: string): string {
	return new Date(instant).toLocaleDateString('en-CA', { timeZone });
}

function approvalItem(inputs: DashboardInputs, group: ApprovalAttention): NeedsYouItem {
	const [one, many] = APPROVAL_NOUN[group.kind];
	const oldest = viewerDay(inputs.timeZone, group.oldestCreatedAt);
	const waiting = Math.max(0, daysBetween(oldest, inputs.today));
	return {
		kind: 'adminApprovals',
		id: `approvals:${group.kind}`,
		approvalKind: group.kind,
		title: `${plural(group.count, one, many)} to review`,
		subtitle: `Oldest from ${formatDayMonth(oldest)}`,
		timing: waiting === 0 ? 'today' : `${plural(waiting, 'day', 'days')} waiting`,
		href: `${orgPath(inputs)}/settings/approvals`,
		action: null,
		urgency: { date: oldest }
	};
}

function invitationItem(inputs: DashboardInputs, invitation: InvitationAttention): NeedsYouItem {
	const expiresOn = viewerDay(inputs.timeZone, invitation.expiresAt);
	const expires = `expires ${formatDayOffset(Math.max(0, daysBetween(inputs.today, expiresOn)))}`;
	const base = {
		id: `invitation:${invitation.id}`,
		invitationId: invitation.id,
		href: `${orgPath(inputs)}/settings/members`,
		action: null,
		urgency: { date: expiresOn }
	};
	return invitation.reason === 'deliveryFailed'
		? {
				...base,
				kind: 'invitationNotDelivered',
				title: `Invitation to ${invitation.email} was not delivered`,
				subtitle: 'Resend it, or revoke it and invite again',
				timing: expires
			}
		: {
				...base,
				kind: 'invitationExpiring',
				title: `Invitation to ${invitation.email} is about to expire`,
				subtitle: 'Not accepted yet',
				timing: expires
			};
}

/** Approvals first, then invitations; ranking across kinds belongs to the queue. Pending and failed states belong to the queue too. */
export const adminAttention: NeedsYouSource = (inputs) => {
	const { adminAttention: state } = inputs.page;
	if (state.status !== 'ready') return [];
	return [
		...state.approvals.map((group) => approvalItem(inputs, group)),
		...state.invitations.map((invitation) => invitationItem(inputs, invitation))
	];
};

export function adminAttentionLoad(inputs: DashboardInputs): NeedsYouLoad | null {
	const { status } = inputs.page.adminAttention;
	return status === 'pending' || status === 'failed'
		? { label: 'Settings', state: status, retry: (updates) => updates.retryAdminAttention() }
		: null;
}
