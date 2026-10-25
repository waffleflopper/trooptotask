import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
	peoplePageSchema,
	personAccessRequestSchema,
	personAccessHistorySchema,
	setupTimelineSchema,
	type PeopleQuery,
	type IdentityPeoplePage
} from './peopleTypes';

export async function readAccountDirectory(client: SupabaseClient, input: PeopleQuery): Promise<IdentityPeoplePage> {
	const { data, error } = await client.rpc('platform_account_directory', {
		p_search: input.search,
		p_filter: input.filter,
		p_page: input.page,
		p_limit: input.limit
	});
	if (error) throw new Error('Unable to load People');
	return peoplePageSchema.parse(data);
}

export function createIdentityPersonReader(client: SupabaseClient) {
	return {
		async accountFacts(userId: string) {
			const { data: profile, error: profileError } = await client
				.from('user_profiles')
				.select('first_name, last_name')
				.eq('user_id', userId)
				.maybeSingle();
			if (profileError) throw new Error('Unable to load account name');
			return { name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null };
		},
		async request(requestId: string) {
			const { data, error } = await client
				.from('access_requests')
				.select(
					'id, name, email, reason, heard_about, heard_about_details, status, created_at, reviewed_at, setup_completed_at, rescinded_at, setup_grant_live'
				)
				.eq('id', requestId)
				.maybeSingle();
			if (error) throw new Error('Unable to load access request');
			return data ? personAccessRequestSchema.parse(data) : null;
		},
		async history(email: string) {
			const { data, error } = await client
				.from('access_requests')
				.select('id, name, email, status, created_at, reviewed_at, setup_completed_at, rescinded_at')
				.eq('email', email.trim().toLowerCase())
				.order('created_at', { ascending: false })
				.order('id', { ascending: false })
				.limit(50);
			if (error || !data) throw new Error('Unable to load access history');
			return z.array(personAccessHistorySchema).parse(data);
		},
		async setupTimeline(requestId: string) {
			const { data, error } = await client
				.from('account_setup_links')
				.select(
					'id, created_at, expires_at, claimed_at, used_at, failed_at, failure_reason, revoked_at, revocation_reason, bounced_at, bounce_reason, deliveries:auth_email_outbox(id, status, attempt_count, created_at, updated_at, sent_at, last_error)'
				)
				.eq('access_request_id', requestId)
				.order('created_at', { referencedTable: 'deliveries', ascending: false })
				.limit(3, { referencedTable: 'deliveries' })
				.order('created_at', { ascending: false })
				.order('id', { ascending: false })
				.limit(50);
			if (error || !data) throw new Error('Unable to load setup timeline');
			return setupTimelineSchema.parse(data);
		}
	};
}
