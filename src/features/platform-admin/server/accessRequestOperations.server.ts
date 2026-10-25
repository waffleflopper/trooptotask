import type { RequestEvent } from '@sveltejs/kit';
import { auditLog } from '$lib/audit/index.server';
import {
	createIdentityPlatformAccessRequestStore,
	createIdentityPlatformSupportReader,
	createSupabaseAccountSetupLinkIssuancePorts,
	createSupabaseSensitiveActionAuthorizer
} from '$features/identity/index.server';
import {
	createOrganizationPlatformInvitationReader,
	createSupabaseOrganizationAdministratorRecipients
} from '$features/organization/index.server';
import { createSupabaseNotificationDelivery } from '$features/notifications/index.server';
import { admitPlatformAdministrator } from './admission.server';
import { createPlatformAccessRequestAdministration } from './accessRequestAdministration.server';
import { readPlatformAccessRequestRows } from './invitationOrigins.server';
import {
	checkPlatformAccessRequestSetupRateLimit,
	createSupabasePlatformAccessRequestRateLimitStore
} from './accessRequestRateLimit.server';

/** Review commands bind the verified reviewer, request assurance, audit attribution and public origin. */
export async function createPlatformAccessRequestOperations(event: RequestEvent) {
	const { actor, adminClient, requestInfo } = await admitPlatformAdministrator(event);
	const requests = createIdentityPlatformAccessRequestStore(adminClient);
	const invitations = createOrganizationPlatformInvitationReader(adminClient);
	const accounts = createIdentityPlatformSupportReader(adminClient);
	const rateLimitStore = createSupabasePlatformAccessRequestRateLimitStore(adminClient);
	const notifications = createSupabaseNotificationDelivery({
		getAdminClient: () => adminClient,
		resolveAdministratorRecipients: createSupabaseOrganizationAdministratorRecipients(() => adminClient)
	});
	const administration = createPlatformAccessRequestAdministration({
		store: {
			...requests,
			listAccessRequests: () => readPlatformAccessRequestRows({ requests, invitations, accounts })
		},
		...createSupabaseAccountSetupLinkIssuancePorts(adminClient),
		sensitiveActionAuthorizer: createSupabaseSensitiveActionAuthorizer({
			supabase: event.locals.supabase,
			session: event.locals.session,
			authenticatedUserId: actor.userId
		}),
		checkSetupRateLimit: (input) =>
			checkPlatformAccessRequestSetupRateLimit({ ...input, adminUserId: actor.userId, store: rateLimitStore }),
		audit: (entry) => auditLog(entry, requestInfo, { required: true }),
		notifyGovernors: {
			notifyInvitationBlocked: (input) =>
				notifications.notifyAdmins(input.organizationId, actor.userId, {
					type: 'member_invite_blocked',
					title: 'Invitation Blocked',
					message: `"${input.email}" can no longer use the organization invitation because platform access was ${input.reason}.`,
					link: `/org/${input.organizationId}/settings/general`
				})
		}
	});
	return {
		list: () => administration.list(),
		approve: (accessRequestId: string) =>
			administration.approve({ accessRequestId, actorUserId: actor.userId, publicOrigin: event.url.origin }),
		resendSetup: (accessRequestId: string) =>
			administration.resendSetup({ accessRequestId, actorUserId: actor.userId, publicOrigin: event.url.origin }),
		reject: (accessRequestId: string, reason?: string | null) =>
			administration.reject({ accessRequestId, actorUserId: actor.userId, reason }),
		rescind: (accessRequestId: string) => administration.rescind({ accessRequestId, actorUserId: actor.userId })
	};
}
