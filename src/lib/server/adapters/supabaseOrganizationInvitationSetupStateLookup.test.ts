import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessRequestSetupStateSource } from '$lib/server/accessRequestSetupState';
import { createSupabaseOrganizationInvitationSetupStateLookupPort } from './supabaseOrganizationInvitationSetupStateLookup';

const now = '2026-09-18T12:00:00.000Z';
const link = {
	id: 'link-current',
	created_at: '2026-09-18T11:00:00.000Z',
	expires_at: '2026-10-02T11:00:00.000Z',
	claimed_at: null,
	failed_at: null,
	failure_reason: null,
	used_at: null,
	revoked_at: null,
	revocation_reason: null
};
const delivery = {
	id: 'delivery-current',
	setup_link_id: 'link-current',
	status: 'sent' as const,
	attempt_count: 1,
	last_error: null,
	created_at: now,
	updated_at: now,
	sent_at: now
};
function source(overrides: Partial<AccessRequestSetupStateSource> = {}): AccessRequestSetupStateSource {
	return { setup_completed_at: null, account_setup_links: [link], auth_email_outbox: [delivery], ...overrides };
}

afterEach(() => vi.useRealTimers());

describe('Organization invitation setup-state lookup', () => {
	it('returns only requested invitation states in the calling Organization without platform details', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(now);
		const rows = [
			{ organization_id: 'org-a', organization_invitation_id: 'invite-a', access_requests: source() },
			{ organization_id: 'org-a', organization_invitation_id: 'unrequested', access_requests: source() },
			{ organization_id: 'org-b', organization_invitation_id: 'invite-b', access_requests: source() }
		];
		const client = createClient('http://localhost:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const url = new URL(String(input));
					expect(init?.method).toBe('GET');
					expect(url.pathname).toBe('/rest/v1/access_request_organization_invitation_links');
					// Apply the actual wire filters to adversarial rows; omitted scope leaks a fixture.
					const selected = rows.filter((row) => {
						const org = url.searchParams.get('organization_id');
						const ids = url.searchParams.get('organization_invitation_id');
						return (
							(!org || org === `eq.${row.organization_id}`) &&
							(!ids || ids.slice(4, -1).split(',').includes(row.organization_invitation_id))
						);
					});
					return Response.json(selected);
				}
			}
		});
		const port = createSupabaseOrganizationInvitationSetupStateLookupPort(() => client);
		expect(await port.findSetupStateByInvitationId('org-a', ['invite-a', 'invite-b'])).toEqual(
			new Map([['invite-a', 'pending']])
		);
	});

	it.each([
		['not_sent', source({ account_setup_links: null, auth_email_outbox: null })],
		['completed', source({ setup_completed_at: now })],
		['completed', source({ account_setup_links: { ...link, used_at: now } })],
		['expired', source({ account_setup_links: [{ ...link, expires_at: now }] })],
		['claimed', source({ account_setup_links: [{ ...link, claimed_at: now }] })],
		[
			'failed',
			source({ account_setup_links: [{ ...link, failed_at: now, failure_reason: 'completion-tracking-failed' }] })
		],
		['replaced', source({ account_setup_links: [{ ...link, revoked_at: now, revocation_reason: 'replaced' }] })],
		[
			'delivery_failed',
			source({ auth_email_outbox: { ...delivery, status: 'failed', last_error: 'provider denied' } })
		],
		['delivery_pending', source({ auth_email_outbox: [{ ...delivery, status: 'pending' }] })],
		[
			'pending',
			source({
				account_setup_links: [
					{ ...link, id: 'old', created_at: '2026-09-01T00:00:00.000Z', expires_at: '2026-09-15T00:00:00.000Z' },
					link
				],
				auth_email_outbox: [
					delivery,
					{
						...delivery,
						id: 'old-delivery',
						setup_link_id: 'old',
						status: 'failed',
						created_at: '2026-09-18T13:00:00.000Z'
					}
				]
			})
		]
	] as const)(
		'reports %s from provider state, including exact expiry and replaced-link delivery',
		async (expected, request) => {
			vi.useFakeTimers();
			vi.setSystemTime(now);
			const client = createClient('http://localhost:9', 'synthetic-service-key', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: {
					fetch: async () =>
						Response.json([
							{ organization_invitation_id: 'invite-object', access_requests: request },
							{ organization_invitation_id: 'invite-array', access_requests: [request] },
							{ organization_invitation_id: 'missing-request', access_requests: null }
						])
				}
			});
			const port = createSupabaseOrganizationInvitationSetupStateLookupPort(() => client);
			expect(
				await port.findSetupStateByInvitationId('org-a', ['invite-object', 'invite-array', 'missing-request'])
			).toEqual(
				new Map([
					['invite-object', expected],
					['invite-array', expected]
				])
			);
		}
	);

	it('propagates provider denial so the consumer cannot present unavailable state as a fresh credential', async () => {
		const client = createClient('http://localhost:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch: async () => Response.json({ message: 'lookup denied' }, { status: 403 }) }
		});
		const port = createSupabaseOrganizationInvitationSetupStateLookupPort(() => client);
		await expect(port.findSetupStateByInvitationId('org-a', ['invite-a'])).rejects.toThrow('lookup denied');
	});

	it('does not access privileged platform state for an empty invitation set', async () => {
		const getAdminClient = vi.fn(() => {
			throw new Error('Privileged access must not occur');
		});
		const port = createSupabaseOrganizationInvitationSetupStateLookupPort(getAdminClient);
		expect(await port.findSetupStateByInvitationId('org-a', [])).toEqual(new Map());
		expect(getAdminClient).not.toHaveBeenCalled();
	});
});
