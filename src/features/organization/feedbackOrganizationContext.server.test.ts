import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseFeedbackOrganizationContextPort } from './feedbackOrganizationContext.server';

type JoinedOrganization = { id: string; name: string; url_slug?: string | null };
interface Membership {
	user_id: string;
	organization_id: string;
	organizations: JoinedOrganization | JoinedOrganization[] | null;
}

function contextProvider(memberships: Membership[]) {
	const state = { error: null as { message: string } | null };
	const client = {
		from(table: string) {
			if (table !== 'organization_memberships') throw new Error(`Unexpected table ${table}`);
			const filters: Array<(membership: Membership) => boolean> = [];
			const query = {
				select() {
					return query;
				},
				eq(column: 'user_id' | 'organization_id', value: string) {
					filters.push((membership) => membership[column] === value);
					return query;
				},
				async maybeSingle() {
					return {
						data: memberships.find((membership) => filters.every((filter) => filter(membership))) ?? null,
						error: state.error
					};
				}
			};
			return query;
		}
	} as unknown as SupabaseClient;
	const getClient = vi.fn(() => client);
	return { port: createSupabaseFeedbackOrganizationContextPort(getClient), state, getClient };
}

describe('Organization feedback context', () => {
	it('reads exact account/Organization membership and returns server-owned name/slug', async () => {
		const { port, getClient } = contextProvider([
			{ user_id: 'peer', organization_id: 'org-a', organizations: { id: 'org-a', name: 'Peer context' } },
			{ user_id: 'actor', organization_id: 'org-b', organizations: { id: 'org-b', name: 'Foreign context' } },
			{
				user_id: 'actor',
				organization_id: 'org-a',
				organizations: { id: 'org-a', name: 'Alpha Company', url_slug: 'alpha-company' }
			}
		]);
		expect(getClient).not.toHaveBeenCalled();

		await expect(port.resolveOrganizationContext({ userId: 'actor', organizationId: 'org-a' })).resolves.toEqual({
			organizationId: 'org-a',
			organizationName: 'Alpha Company',
			organizationUrlSlug: 'alpha-company'
		});
	});

	it('does not use a peer membership or another Organization as context for the requested account', async () => {
		const { port } = contextProvider([
			{ user_id: 'peer', organization_id: 'org-a', organizations: { id: 'org-a', name: 'Peer context' } },
			{ user_id: 'actor', organization_id: 'org-b', organizations: { id: 'org-b', name: 'Foreign context' } }
		]);

		await expect(port.resolveOrganizationContext({ userId: 'actor', organizationId: 'org-a' })).resolves.toBeNull();
	});

	it.each([null, []] as const)(
		'returns no context when the membership has no joined Organization: %j',
		async (organizations) => {
			const { port } = contextProvider([
				{ user_id: 'actor', organization_id: 'org-a', organizations: organizations === null ? null : [] }
			]);

			await expect(port.resolveOrganizationContext({ userId: 'actor', organizationId: 'org-a' })).resolves.toBeNull();
		}
	);

	it('accepts the provider array join form and preserves missing URL slug as null', async () => {
		const { port } = contextProvider([
			{ user_id: 'actor', organization_id: 'org-a', organizations: [{ id: 'org-a', name: 'Alpha Company' }] }
		]);

		await expect(port.resolveOrganizationContext({ userId: 'actor', organizationId: 'org-a' })).resolves.toEqual({
			organizationId: 'org-a',
			organizationName: 'Alpha Company',
			organizationUrlSlug: null
		});
	});

	it('rejects unavailable membership results even when accompanied by joined data', async () => {
		const { port, state } = contextProvider([
			{ user_id: 'actor', organization_id: 'org-a', organizations: { id: 'org-a', name: 'Alpha Company' } }
		]);
		state.error = { message: 'membership unavailable' };

		await expect(port.resolveOrganizationContext({ userId: 'actor', organizationId: 'org-a' })).rejects.toThrow(
			'Failed to resolve feedback organization context'
		);
	});
});
