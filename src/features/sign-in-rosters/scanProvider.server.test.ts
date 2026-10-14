import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabaseSignInRosterScanPort } from './scanProvider.server';

const orgId = 'ab181000-0000-4000-8000-000000000101';
const userId = 'ab181000-0000-4000-8000-000000000001';
const rosterId = 'ab181000-0000-4000-8000-0000000003ab';
const prefix = `${orgId}/sign-in-rosters/${rosterId}/`;
const oldPath = `${prefix}old.pdf`;
const newPath = `${prefix}new.pdf`;
const otherPath = `${prefix}other.pdf`;
const file = new File(['%PDF-1.7'], 'signed.pdf', { type: 'application/pdf' });

type Reply = { data: unknown } | { status: number; code: string; message: string } | 'lost';

interface Scenario {
	pointer?: string | null;
	scope?: string[];
	writable?: boolean;
	uploadLost?: boolean;
	attach?: Reply;
	remove?: Reply;
	delete?: Reply;
	settle?: Reply;
	storageRemoveFails?: boolean;
	completeFails?: boolean;
	displacedBy?: string;
}

const unacknowledged = { message: 'Roster scan command was not acknowledged' };

function denied(code: string, message = 'Denied', status = 400): Reply {
	return { status, code, message };
}

function fixture(scenario: Scenario = {}) {
	const registrations = new Map<string, Record<string, unknown>>();
	const files = new Map<string, string>([[oldPath, 'old signed bytes']]);
	const calls: string[] = [];
	const rpcArgs: Record<string, unknown> = {};
	const saved = { pointer: scenario.pointer ?? null };
	const reply = (value: Reply | undefined, fallback: unknown) => {
		if (value === 'lost') throw new TypeError('fetch failed');
		if (!value) return Response.json(fallback);
		if ('data' in value) return Response.json(value.data);
		return Response.json({ code: value.code, message: value.message }, { status: value.status });
	};
	const transport: typeof fetch = async (resource, init) => {
		const url = new URL(String(resource));
		const who = url.hostname === 'ordinary.invalid' ? 'ordinary' : 'service';
		const method = init?.method ?? 'GET';
		const rpc = url.pathname.startsWith('/rest/v1/rpc/') ? url.pathname.slice('/rest/v1/rpc/'.length) : null;
		calls.push(`${who} ${rpc ?? `${method} ${decodeURIComponent(url.pathname)}`}`);
		const args = rpc ? (JSON.parse(String(init?.body)) as Record<string, unknown>) : {};
		if (rpc) rpcArgs[rpc] = args;
		if (who === 'ordinary' && url.pathname === '/rest/v1/sign_in_rosters')
			return Response.json({ scope_group_ids: scenario.scope ?? [], signed_file_path: scenario.pointer ?? null });
		if (who === 'ordinary' && rpc === 'sensitive_file_object_is_writable')
			return Response.json(scenario.writable ?? true);
		if (who === 'ordinary' && rpc === 'attach_sign_in_roster_scan') {
			if (!scenario.displacedBy) return reply(scenario.attach, oldPath);
			saved.pointer = String(args.p_object_name);
			throw new TypeError('fetch failed');
		}
		if (who === 'ordinary' && rpc === 'remove_sign_in_roster_scan')
			return reply(scenario.remove, [{ outcome: 'removed', retired_object_name: oldPath }]);
		if (who === 'ordinary' && rpc === 'delete_sign_in_roster')
			return reply(scenario.delete, [{ title: 'Known roster', retired_object_name: oldPath }]);
		if (who === 'service' && rpc === 'register_organization_file_upload') {
			registrations.set(String(args.p_upload_id), args);
			return Response.json(args.p_upload_id);
		}
		if (who === 'service' && rpc === 'settle_organization_file_upload') {
			if (scenario.completeFails) return Response.json({ message: 'Unavailable' }, { status: 503 });
			return Response.json(registrations.delete(String(args.p_upload_id)));
		}
		if (who === 'service' && rpc === 'settle_sign_in_roster_scan_upload') {
			if (!scenario.displacedBy) return reply(scenario.settle, [{ attached: false, retired_object_name: newPath }]);
			saved.pointer = scenario.displacedBy;
			files.set(scenario.displacedBy, 'other signed bytes');
			const attached = saved.pointer === args.p_object_name;
			return Response.json([{ attached, retired_object_name: attached ? null : args.p_object_name }]);
		}
		if (who === 'service' && rpc === 'complete_organization_file_retirements') return Response.json(null);
		if (who === 'service' && url.pathname === `/storage/v1/object/counseling-files/${newPath}` && method === 'POST') {
			files.set(newPath, await ((init?.body as FormData).get('') as File).text());
			if (scenario.uploadLost) throw new TypeError('fetch failed');
			return Response.json({ Id: 'ab181000-0000-4000-8000-000000000501', Key: `counseling-files/${newPath}` });
		}
		if (who === 'service' && url.pathname === '/storage/v1/object/counseling-files' && method === 'DELETE') {
			if (scenario.storageRemoveFails) return Response.json({ message: 'Unavailable' }, { status: 503 });
			const paths = (JSON.parse(String(init?.body)) as { prefixes: string[] }).prefixes;
			return Response.json(paths.filter((path) => files.delete(path)).map((name) => ({ name })));
		}
		throw new Error(`Unexpected provider request: ${who} ${method} ${url.pathname}`);
	};
	const client = (origin: string) =>
		createClient(origin, 'synthetic-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: { fetch: transport }
		});
	const scans = createSupabaseSignInRosterScanPort(client('http://ordinary.invalid'), () =>
		client('http://service.invalid')
	);
	return { scans, actor: createTestAuthContext({ orgId, userId }), registrations, files, calls, rpcArgs, saved };
}

afterEach(() => vi.restoreAllMocks());

describe('roster scan replacement through the actual SDK', () => {
	it('attaches the registered upload, then removes the displaced scan and settles the registration', async () => {
		const run = fixture({ pointer: oldPath });
		await run.scans.replace(run.actor, rosterId.toUpperCase(), newPath, file);
		expect(run.rpcArgs.attach_sign_in_roster_scan).toEqual({
			p_organization_id: orgId,
			p_roster_id: rosterId,
			p_object_name: newPath
		});
		expect(run.rpcArgs.complete_organization_file_retirements).toEqual({
			p_bucket_id: 'counseling-files',
			p_object_names: [oldPath]
		});
		expect(run.files).toEqual(new Map([[newPath, '%PDF-1.7']]));
		expect(run.registrations.size).toBe(0);
	});

	it.each([
		['a key outside the roster', `${orgId}/sign-in-rosters/other/new.pdf`, rosterId, 400],
		['a malformed roster id', newPath, 'roster-1', 404]
	])('refuses %s before any provider request', async (_case, path, id, status) => {
		const run = fixture();
		await expect(run.scans.replace(run.actor, id, path, file)).rejects.toMatchObject({ status });
		expect(run.calls).toEqual([]);
	});

	it('refuses a legacy unowned pointer before registering or uploading bytes', async () => {
		const run = fixture({ pointer: `${orgId}/${rosterId}/signed.pdf` });
		await expect(run.scans.replace(run.actor, rosterId, newPath, file)).rejects.toMatchObject({
			status: 400,
			message: "This roster's signed scan uses an unsupported storage location"
		});
		expect(run.calls).toEqual(['ordinary GET /rest/v1/sign_in_rosters']);
	});

	it('admits uploads only when every roster Group is within the actor scope', async () => {
		const run = fixture({ scope: ['group-alpha', 'group-bravo'] });
		const actor = {
			...run.actor,
			role: 'member' as const,
			isPrivileged: false,
			scopeSet: { kind: 'groups' as const, groupIds: ['group-alpha'] }
		};
		await expect(run.scans.replace(actor, rosterId, newPath, file)).rejects.toMatchObject({ status: 403 });
		expect(run.calls).toEqual(['ordinary GET /rest/v1/sign_in_rosters']);
		const admitted = fixture({ scope: ['group-alpha'] });
		await admitted.scans.replace(actor, rosterId, newPath, file);
		expect(admitted.files.get(newPath)).toBe('%PDF-1.7');
	});

	it('settles the registration without bytes when fresh upload access is gone', async () => {
		const run = fixture({ writable: false });
		await expect(run.scans.replace(run.actor, rosterId, newPath, file)).rejects.toMatchObject({ status: 403 });
		expect(run.registrations.size).toBe(0);
		expect(run.files).toEqual(new Map([[oldPath, 'old signed bytes']]));
	});

	it('keeps the registration open when the byte upload is unconfirmed', async () => {
		const run = fixture({ uploadLost: true });
		await expect(run.scans.replace(run.actor, rosterId, newPath, file)).rejects.toThrow(
			'Scan upload could not be confirmed'
		);
		expect(run.registrations.size).toBe(1);
		expect(run.calls).not.toContain('ordinary attach_sign_in_roster_scan');
	});

	it('reconciles a lost attach reply that actually saved the scan', async () => {
		const run = fixture({ attach: 'lost', settle: { data: [{ attached: true, retired_object_name: null }] } });
		await run.scans.replace(run.actor, rosterId, newPath, file);
		expect(run.files.get(newPath)).toBe('%PDF-1.7');
		expect(run.registrations.size).toBe(0);
	});

	it.each([
		[
			'a lost reply',
			'lost' as const,
			{ status: 503, message: 'The signed scan change could not be confirmed. Reload to check it.' }
		],
		[
			'a deadlock',
			denied('40P01', 'deadlock detected'),
			{ status: 503, message: 'The signed scan change was not saved. Try again.' }
		],
		['a revoked actor', denied('42501', 'Sign-in roster management is not allowed', 403), { status: 403 }],
		['a deleted roster', denied('P0002', 'This roster is no longer available', 404), { status: 404 }]
	])('retires and removes the unattached upload after %s', async (_case, attach, failure) => {
		const run = fixture({ attach });
		await expect(run.scans.replace(run.actor, rosterId, newPath, file)).rejects.toMatchObject(failure);
		expect(run.rpcArgs.settle_sign_in_roster_scan_upload).toEqual({
			p_organization_id: orgId,
			p_roster_id: rosterId,
			p_object_name: newPath
		});
		expect(run.files).toEqual(new Map([[oldPath, 'old signed bytes']]));
		expect(run.registrations.size).toBe(0);
	});

	it('keeps a committed then displaced attach unconfirmed and removes only its retired key', async () => {
		const run = fixture({ pointer: oldPath, displacedBy: otherPath });
		await expect(run.scans.replace(run.actor, rosterId, newPath, file)).rejects.toMatchObject({
			status: 503,
			message: 'The signed scan change could not be confirmed. Reload to check it.'
		});
		expect(run.saved.pointer).toBe(otherPath);
		expect(run.files).toEqual(
			new Map([
				[oldPath, 'old signed bytes'],
				[otherPath, 'other signed bytes']
			])
		);
		expect(run.registrations.size).toBe(0);
	});

	it.each([
		['fails', 'lost' as const],
		['returns a malformed receipt', { data: [{ attached: false, retired_object_name: oldPath }] }]
	])('keeps bytes and the registration when reconciliation %s', async (_case, settle) => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const run = fixture({ attach: denied('42501', 'Sign-in roster management is not allowed', 403), settle });
		await expect(run.scans.replace(run.actor, rosterId, newPath, file)).rejects.toMatchObject({ status: 403 });
		expect(run.files.get(newPath)).toBe('%PDF-1.7');
		expect(run.files.get(oldPath)).toBe('old signed bytes');
		expect(run.registrations.size).toBe(1);
		expect(log).toHaveBeenCalledWith(
			'[sign-in-roster-scan] Upload registration remains unsettled:',
			expect.any(String)
		);
	});

	it('reports a saved scan as saved when cleanup and registration completion fail', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const run = fixture({ storageRemoveFails: true, completeFails: true });
		await expect(run.scans.replace(run.actor, rosterId, newPath, file)).resolves.toBeUndefined();
		expect(run.files.get(oldPath)).toBe('old signed bytes');
		expect(run.registrations.size).toBe(1);
		expect(log).toHaveBeenCalledTimes(1);
	});
});

describe('roster scan removal and roster deletion through the actual SDK', () => {
	it('removes the exact released key after a confirmed compare-and-clear', async () => {
		const run = fixture();
		await expect(run.scans.remove(run.actor, rosterId, oldPath)).resolves.toBe('complete');
		expect(run.rpcArgs.remove_sign_in_roster_scan).toEqual({
			p_organization_id: orgId,
			p_roster_id: rosterId,
			p_expected_object_name: oldPath
		});
		expect(run.files.size).toBe(0);
	});

	it('reports pending cleanup without failing the confirmed removal', async () => {
		const run = fixture({ storageRemoveFails: true });
		await expect(run.scans.remove(run.actor, rosterId, oldPath)).resolves.toBe('pending');
		expect(run.files.get(oldPath)).toBe('old signed bytes');
	});

	it.each([
		['a changed scan', { data: [{ outcome: 'changed', retired_object_name: null }] }, { status: 409 }],
		['a lost reply', 'lost' as const, { status: 503, message: expect.stringContaining('could not be confirmed') }],
		[
			'a lock conflict',
			denied('40P01', 'deadlock detected'),
			{ status: 503, message: expect.stringContaining('not saved') }
		],
		['a different released key', { data: [{ outcome: 'removed', retired_object_name: newPath }] }, unacknowledged],
		['duplicate receipts', { data: [{ outcome: 'removed', retired_object_name: null }, {}] }, unacknowledged]
	])('removes no bytes after %s', async (_case, remove, failure) => {
		const run = fixture({ remove });
		await expect(run.scans.remove(run.actor, rosterId, oldPath)).rejects.toMatchObject(failure);
		expect(run.files.get(oldPath)).toBe('old signed bytes');
		expect(run.calls).toEqual(['ordinary remove_sign_in_roster_scan']);
	});

	it('deletes the roster and removes its released scan', async () => {
		const run = fixture();
		await expect(run.scans.deleteRoster(run.actor, rosterId)).resolves.toEqual({
			title: 'Known roster',
			fileCleanup: 'complete'
		});
		expect(run.files.size).toBe(0);
	});

	it.each([
		[
			'a missing roster',
			denied('P0002', 'This roster is no longer available', 404),
			{ status: 404, message: 'This roster is no longer available.' }
		],
		[
			'a legacy pointer',
			denied('22023', "This roster's signed scan uses an unsupported storage location"),
			{ status: 400 }
		],
		['a missing title', { data: [{ retired_object_name: oldPath }] }, unacknowledged]
	])('removes no bytes after %s', async (_case, reply, failure) => {
		const run = fixture({ delete: reply });
		await expect(run.scans.deleteRoster(run.actor, rosterId)).rejects.toMatchObject(failure);
		expect(run.files.get(oldPath)).toBe('old signed bytes');
	});
});
