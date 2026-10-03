import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createOrganizationPlatformInvitationReader } from './invitationSupportReader.server';

function reader(fetch: typeof globalThis.fetch) {
	return createOrganizationPlatformInvitationReader(
		createClient('http://127.0.0.1:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: { fetch }
		})
	);
}

describe('Organization invitation support facts', () => {
	it('reads every linked origin beyond the provider cap and keeps Organization facts separate from account labels', async () => {
		const rows = Array.from({ length: 1001 }, (_, index) => ({
			access_request_id: 'request-1',
			id: `link-${index}`,
			organization_invitation_id: `invite-${index}`,
			organization_id: 'org-1',
			invited_by: 'leader-1',
			invited_at: '2026-06-01',
			intended_membership_role: 'member',
			intended_member_preset: 'viewer',
			organizations: { id: 'org-1', name: 'Alpha Company' }
		}));
		const result = await reader(async (input) => {
			const url = new URL(input.toString());
			expect(url.pathname).toBe('/rest/v1/access_request_organization_invitation_links');
			expect(url.searchParams.get('access_request_id')).toBe('in.(request-1)');
			const offset = Number(url.searchParams.get('offset') ?? 0);
			return Response.json(rows.slice(offset, offset + Number(url.searchParams.get('limit'))));
		}).listInvitationOrigins(['request-1']);
		expect(result.get('request-1')).toHaveLength(1001);
		expect(result.get('request-1')?.at(-1)).toEqual({
			id: 'link-1000',
			organization_invitation_id: 'invite-1000',
			organization_id: 'org-1',
			invited_by: 'leader-1',
			invited_at: '2026-06-01',
			intended_membership_role: 'member',
			intended_member_preset: 'viewer',
			organizations: { id: 'org-1', name: 'Alpha Company' }
		});
	});
	it('does not accept a foreign Access Request origin or hide a provider failure', async () => {
		await expect(
			reader(async () => Response.json([{ access_request_id: 'other-request' }])).listInvitationOrigins(['request-1'])
		).rejects.toThrow('Unexpected');
		await expect(
			reader(async () => Response.json({ message: 'private-provider-detail' }, { status: 500 })).listInvitationOrigins([
				'request-1'
			])
		).rejects.toThrow('Unable');
	});
	it('needs no provider access when there are no Access Requests', async () => {
		await expect(
			reader(async () => {
				throw new Error('No read should be needed');
			}).listInvitationOrigins([])
		).resolves.toEqual(new Map());
	});
});
