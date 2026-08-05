import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createAccountSetupLinkService,
	createSupabaseAccountSetupLinkStore,
	sendAccountSetupLinkEmail
} from '$lib/server/accountSetupLinks';
import { createSupabaseAuthEmailOutboxStore, sendAccountSetupOutboxDelivery } from '$lib/server/authEmailOutbox';
import type {
	AccountSetupLinkIssuanceCreator,
	AccountSetupLinkIssuanceDelivery
} from '$lib/server/accountSetupLinkIssuance';

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
			send: (input) =>
				sendAccountSetupOutboxDelivery(createSupabaseAuthEmailOutboxStore(client), sendAccountSetupLinkEmail, input)
		}
	};
}
