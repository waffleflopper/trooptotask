import { createClient } from '@supabase/supabase-js';
import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from './+server';
const ID = '11111111-1111-4111-8111-111111111111';
const writes: unknown[] = [];
let failed = false;
const client = createClient('http://127.0.0.1:9', 'synthetic-key', {
	auth: { persistSession: false, autoRefreshToken: false },
	global: {
		fetch: async (input, init) => {
			const request = new Request(input, init);
			if (new URL(request.url).pathname !== '/rest/v1/announcement_dismissals' || request.method !== 'POST')
				throw new Error('Unexpected provider operation');
			if (failed) return Response.json({ message: 'Provider unavailable' }, { status: 403 });
			writes.push(await request.json());
			return new Response(null, { status: 201 });
		}
	}
});
function event(actor: { userId: string } | null, body: Record<string, unknown>) {
	return {
		locals: { actor, user: { id: 'provider-user' }, supabase: client },
		request: new Request('http://test/api/announcements/dismiss', { method: 'POST', body: JSON.stringify(body) })
	} as unknown as Parameters<typeof POST>[0];
}
beforeEach(() => {
	writes.length = 0;
	failed = false;
});
it('requires an admitted account and valid ID before writes, preserving HTTP denial shape', async () => {
	await expect(POST(event(null, { announcementId: ID }))).rejects.toMatchObject({
		status: 401,
		body: { message: 'Not authenticated' }
	});
	await expect(POST(event({ userId: 'account-a' }, { announcementId: 'invalid' }))).rejects.toMatchObject({
		status: 400,
		body: { message: 'Invalid announcement ID' }
	});
	expect(writes).toEqual([]);
});
it('ignores body/provider identities and needs no Organization admission', async () => {
	const response = await POST(
		event({ userId: 'account-a' }, { announcementId: ID, userId: 'forged', organizationId: 'foreign' })
	);
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ success: true });
	expect(writes).toEqual([{ announcement_id: ID, user_id: 'account-a' }]);
});
it('reports failed persistence and permits an explicit retry', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		failed = true;
		await expect(POST(event({ userId: 'account-a' }, { announcementId: ID }))).rejects.toMatchObject({ status: 500 });
		expect(writes).toEqual([]);
		failed = false;
		expect((await POST(event({ userId: 'account-a' }, { announcementId: ID }))).status).toBe(200);
		expect(writes).toEqual([{ announcement_id: ID, user_id: 'account-a' }]);
	} finally {
		log.mockRestore();
	}
});
