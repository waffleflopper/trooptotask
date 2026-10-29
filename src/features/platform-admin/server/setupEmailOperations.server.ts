import type { SupabaseClient } from '$lib/server/database';
import type { RequestEvent } from '@sveltejs/kit';
import { createIdentityPersonReader, createIdentitySetupEmailInboxReader } from '$features/identity/index.server';
import {
	createOrganizationPlatformInvitationReader,
	createOrganizationSupportReader
} from '$features/organization/index.server';
import { createSetupEmailAddressCheckNotifier } from '$features/notifications/index.server';
import { auditLog } from '$lib/audit/index.server';
import { admitPlatformAdministrator } from './admission.server';

export async function readSetupEmailInviters(client: SupabaseClient, requestId: string) {
	const origins =
		(
			await createOrganizationPlatformInvitationReader(client).listInvitationOrigins([requestId], { pendingOnly: true })
		).get(requestId) ?? [];
	const memberships = createOrganizationSupportReader(client);
	const unique = [
		...new Map(origins.map((origin) => [`${origin.organization_id}:${origin.invited_by}`, origin])).values()
	];
	const eligible = await Promise.all(
		unique.map(async (origin) => {
			const current = await memberships.listMembershipsForUser(origin.invited_by);
			return current.some((m) => m.organization?.id === origin.organization_id) ? origin : null;
		})
	);
	return eligible.filter((origin) => origin !== null);
}

export async function createPlatformSetupEmailOperations(event: RequestEvent) {
	const { adminClient, requestInfo } = await admitPlatformAdministrator(event);
	const reader = createIdentitySetupEmailInboxReader(adminClient);
	const notifyInviters = createSetupEmailAddressCheckNotifier(adminClient);
	return {
		async askInviter(linkId: string) {
			const item = await reader.get(linkId);
			if (!item?.isOpen) return { status: 'not_open' as const };
			const inviters = await readSetupEmailInviters(adminClient, item.requestId);
			if (!inviters.length) return { status: 'no_inviter' as const };
			await notifyInviters({
				recipients: inviters.map((origin) => ({ organizationId: origin.organization_id, userId: origin.invited_by })),
				name: item.name,
				email: item.email,
				reason: item.reason
			});
			try {
				await auditLog(
					{
						action: 'access_request.inviter_address_check_requested',
						resourceType: 'access_request',
						resourceId: item.requestId,
						details: {
							actorEmail: requestInfo.userEmail,
							targetName: item.name,
							setupLinkId: linkId,
							recipientCount: inviters.length
						}
					},
					requestInfo,
					{ required: true }
				);
			} catch {
				return { status: 'notified_audit_failed' as const };
			}
			return { status: 'notified' as const };
		},
		async resolveLink(linkId: string) {
			const item = await reader.get(linkId);
			return item?.isOpen ? item.requestId : null;
		},
		timeline: (requestId: string) => createIdentityPersonReader(adminClient).setupTimeline(requestId)
	};
}
