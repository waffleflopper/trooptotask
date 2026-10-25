import type { SupabaseClient } from '@supabase/supabase-js';

import { setupEmailPageSchema } from './setupEmailTypes';

export function createIdentitySetupEmailInboxReader(client: SupabaseClient) {
	async function read(input: { tab: 'open' | 'done'; limit: number; now?: Date; linkId?: string }) {
		const { data, error } = await client.rpc('platform_setup_email_inbox', {
			p_tab: input.tab,
			p_limit: input.limit,
			p_now: (input.now ?? new Date()).toISOString(),
			p_link_id: input.linkId ?? null
		});
		if (error) throw new Error('Unable to load setup emails');
		return setupEmailPageSchema.parse(data);
	}
	return {
		read,
		async get(id: string) {
			return (await read({ tab: 'open', limit: 1, linkId: id })).rows[0] ?? null;
		}
	};
}
