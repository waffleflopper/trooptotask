import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabasePersonnelLifecycleCommands } from './personnelLifecycleCommands.server';

function lifecycleRpc(reply: () => Response) {
	const calls: Array<{ path: string; body: unknown }> = [];
	const client = createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				calls.push({ path: new URL(request.url).pathname, body: await request.json() });
				return reply();
			}
		}
	});
	return { calls, commands: createSupabasePersonnelLifecycleCommands(client, 'org-a') };
}

const archivedAt = '2026-10-01T12:00:00.000Z';

describe('Personnel lifecycle commands', () => {
	it('archives each distinct Person in one call and accepts the matching count', async () => {
		const { calls, commands } = lifecycleRpc(() => Response.json(2));
		await commands.archive(['p-1', 'p-2', 'p-1'], archivedAt);
		expect(calls).toEqual([
			{
				path: '/rest/v1/rpc/archive_personnel',
				body: { p_organization_id: 'org-a', p_personnel_ids: ['p-1', 'p-2'], p_archived_at: archivedAt }
			}
		]);
	});

	it('counts one Person per UUID whatever its letter case', async () => {
		const id = 'a1b2c3d4-0000-4000-8000-00000000abcd';
		const { calls, commands } = lifecycleRpc(() => Response.json(1));
		await commands.archive([id, 'A1B2C3D4-0000-4000-8000-00000000ABCD'], archivedAt);
		expect(calls).toEqual([
			{
				path: '/rest/v1/rpc/archive_personnel',
				body: { p_organization_id: 'org-a', p_personnel_ids: [id], p_archived_at: archivedAt }
			}
		]);
	});

	it('restores one Person and returns whether it was archived', async () => {
		for (const restored of [true, false]) {
			const { calls, commands } = lifecycleRpc(() => Response.json(restored));
			await expect(commands.restore('p-1')).resolves.toBe(restored);
			expect(calls).toEqual([
				{ path: '/rest/v1/rpc/restore_personnel', body: { p_organization_id: 'org-a', p_personnel_id: 'p-1' } }
			]);
		}
	});

	it('approves the bound request and Person together', async () => {
		const { calls, commands } = lifecycleRpc(() => Response.json(true));
		await commands.approveArchiveRequest('request-1', 'p-1', archivedAt);
		expect(calls).toEqual([
			{
				path: '/rest/v1/rpc/approve_personnel_archive_request',
				body: {
					p_organization_id: 'org-a',
					p_request_id: 'request-1',
					p_personnel_id: 'p-1',
					p_reviewed_at: archivedAt
				}
			}
		]);
	});

	it.each([
		['an archive count for fewer People', 'archive', 1, 'Personnel archive was not acknowledged'],
		['an archive without a count', 'archive', null, 'Personnel archive was not acknowledged'],
		['a restore without a result', 'restore', null, 'Personnel restore was not acknowledged'],
		['a restore with a non-boolean result', 'restore', 'true', 'Personnel restore was not acknowledged'],
		['an unapproved request', 'approve', false, 'Personnel archive approval was not acknowledged'],
		['an approval without a result', 'approve', null, 'Personnel archive approval was not acknowledged']
	] as const)('rejects %s without retrying', async (_case, command, reply, message) => {
		const { calls, commands } = lifecycleRpc(() => Response.json(reply));
		const run = {
			archive: () => commands.archive(['p-1', 'p-2'], archivedAt),
			restore: () => commands.restore('p-1'),
			approve: () => commands.approveArchiveRequest('request-1', 'p-1', archivedAt)
		}[command];
		await expect(run()).rejects.toThrow(message);
		expect(calls).toHaveLength(1);
	});

	it.each([
		['P0002', 'Pending deletion request not found', { status: 404 }],
		['42501', 'Archiving or restoring Personnel requires configure access', { status: 403 }]
	])('maps rejected command %s to a request failure without retrying', async (code, message, expected) => {
		const { calls, commands } = lifecycleRpc(() => Response.json({ code, message }, { status: 400 }));
		await expect(commands.archive(['p-1'], archivedAt)).rejects.toMatchObject({ ...expected, message });
		expect(calls).toHaveLength(1);
	});

	it('propagates any other rejected command without retrying', async () => {
		const { calls, commands } = lifecycleRpc(() =>
			Response.json({ code: '40P01', message: 'deadlock detected' }, { status: 500 })
		);
		await expect(commands.restore('p-1')).rejects.toThrow('deadlock detected');
		expect(calls).toHaveLength(1);
	});
});
