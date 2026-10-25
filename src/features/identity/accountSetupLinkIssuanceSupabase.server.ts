import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createAccountSetupLinkService,
	createSupabaseAccountSetupLinkStore,
	sendAccountSetupLinkEmail
} from './accountSetupLinks.server';
import { createSupabaseAuthEmailOutboxStore, sendAccountSetupOutboxDelivery } from './authEmailOutbox.server';
import type {
	AccountSetupLinkIssuanceCreator,
	AccountSetupLinkIssuanceDelivery
} from './accountSetupLinkIssuance.server';

/**
 * The service-role halves of `accountSetupLinkIssuance`. Every issuer composes the module
 * itself; what they share is this wiring, so the table and outbox knowledge lives here
 * instead of in each caller.
 */
export function createSupabaseAccountSetupLinkIssuancePorts(client: SupabaseClient): {
	setupLinks: AccountSetupLinkIssuanceCreator;
	setupDelivery: AccountSetupLinkIssuanceDelivery;
} {
	return {
		setupLinks: createAccountSetupLinkService(createSupabaseAccountSetupLinkStore(client)),
		setupDelivery: {
			send: async (input) => {
				const delivery = await sendAccountSetupOutboxDelivery(
					createSupabaseAuthEmailOutboxStore(client),
					sendAccountSetupLinkEmail,
					input
				);
				if (delivery.status !== 'sent') return delivery;
				if (!delivery.emailId)
					return {
						status: 'sent_recording_failed',
						outbox: delivery.outbox,
						error: 'The setup email was sent, but the provider did not return a valid delivery ID'
					};
				try {
					const { error } = await client
						.from('account_setup_links')
						.update({ resend_email_id: delivery.emailId })
						.eq('id', input.setupLinkId);
					if (error) throw error;
				} catch {
					return {
						status: 'sent_recording_failed',
						outbox: delivery.outbox,
						error: 'The setup email was sent, but its delivery ID could not be recorded'
					};
				}
				return delivery;
			}
		}
	};
}
