import { createClient } from '@supabase/supabase-js';
import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseSignInRosterScanPort } from '$features/sign-in-rosters/scanProvider.server';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { rethrowOrWrap } from '$lib/server/adapters/httpAdapter';
import { createProviderFaultController } from './outbound-controls.mjs';

const providerUrl = 'http://127.0.0.1:54321';
const orgId = 'ab181000-0000-4000-8000-000000000101';
const userId = 'ab181000-0000-4000-8000-000000000001';
const rosterId = 'ab181000-0000-4000-8000-0000000003ab';
const prefix = `${orgId}/sign-in-rosters/${rosterId}/`;
const [oldPath, pathK, pathL] = ['old', 'k', 'l'].map((name) => `${prefix}${name}.pdf`);
const UNCONFIRMED = 'The signed scan change could not be confirmed. Reload to check it.';
const NOT_SAVED = 'The signed scan change was not saved. Try again.';

const pdf = (name: string) => new File([`%PDF-1.7 ${name}`], `${name}.pdf`, { type: 'application/pdf' });

function provider() {
	const state = {
		pointer: oldPath as string | null,
		rosterExists: true,
		files: new Map<string, string>([[oldPath, 'old bytes']]),
		retired: new Set<string>(),
		registrations: new Map<string, unknown>(),
		attachCalls: 0,
		attachFailure: null as null | { code: string; message: string },
		beforeSettle: null as null | (() => void)
	};
	const rpcFailure = (code: string, message: string, status = 400) =>
		Response.json({ code, message, details: null, hint: null }, { status });
	const fetchProvider: typeof fetch = async (resource, init) => {
		const url = new URL(String(resource));
		const method = init?.method ?? 'GET';
		const service = new Headers(init?.headers).get('apikey') === 'service-key';
		const rpc = url.pathname.startsWith('/rest/v1/rpc/') ? url.pathname.slice('/rest/v1/rpc/'.length) : null;
		const args = rpc ? (JSON.parse(String(init?.body)) as Record<string, string>) : {};
		const retire = (path: string | null) => path && state.retired.add(path);
		if (!service && url.pathname === '/rest/v1/sign_in_rosters')
			return state.rosterExists
				? Response.json({ scope_group_ids: [], signed_file_path: state.pointer })
				: Response.json(null);
		if (!service && rpc === 'sensitive_file_object_is_writable') return Response.json(true);
		if (!service && rpc === 'attach_sign_in_roster_scan') {
			state.attachCalls++;
			if (state.attachFailure) return rpcFailure(state.attachFailure.code, state.attachFailure.message);
			const previous = state.pointer;
			state.pointer = args.p_object_name;
			retire(previous);
			return Response.json(previous);
		}
		if (!service && rpc === 'remove_sign_in_roster_scan') {
			if (args.p_expected_object_name !== state.pointer)
				return Response.json([{ outcome: 'changed', retired_object_name: null }]);
			retire(state.pointer);
			state.pointer = null;
			return Response.json([{ outcome: 'removed', retired_object_name: args.p_expected_object_name }]);
		}
		if (!service && rpc === 'delete_sign_in_roster') {
			if (!state.rosterExists) return rpcFailure('P0002', 'Roster not found', 404);
			const retired = state.pointer;
			retire(retired);
			state.rosterExists = false;
			state.pointer = null;
			return Response.json([{ title: 'Known roster', retired_object_name: retired }]);
		}
		if (service && rpc === 'register_organization_file_upload') {
			state.registrations.set(args.p_upload_id, args);
			return Response.json(args.p_upload_id);
		}
		if (service && rpc === 'settle_organization_file_upload')
			return Response.json(state.registrations.delete(args.p_upload_id));
		if (service && rpc === 'settle_sign_in_roster_scan_upload') {
			state.beforeSettle?.();
			state.beforeSettle = null;
			const attached = state.pointer === args.p_object_name;
			if (!attached) retire(args.p_object_name);
			return Response.json([{ attached, retired_object_name: attached ? null : args.p_object_name }]);
		}
		if (service && rpc === 'complete_organization_file_retirements') return Response.json(null);
		if (service && method === 'POST' && url.pathname.startsWith('/storage/v1/object/counseling-files/')) {
			const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/counseling-files/'.length));
			state.files.set(path, await ((init?.body as FormData).get('') as File).text());
			return Response.json({ Id: 'ab181000-0000-4000-8000-000000000501', Key: `counseling-files/${path}` });
		}
		if (service && method === 'DELETE' && url.pathname === '/storage/v1/object/counseling-files') {
			const paths = (JSON.parse(String(init?.body)) as { prefixes: string[] }).prefixes;
			return Response.json(paths.filter((path) => state.files.delete(path)).map((name) => ({ name })));
		}
		throw new Error(`Unexpected provider request: ${service ? 'service' : 'ordinary'} ${method} ${url.pathname}`);
	};
	return { state, fetchProvider };
}

function harness() {
	const stateful = provider();
	const controls = createProviderFaultController({ providerUrl, fetch: stateful.fetchProvider });
	const client = (key: string) =>
		createClient(providerUrl, key, {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: { fetch: controls.fetch }
		});
	const scans = createSupabaseSignInRosterScanPort(client('ordinary-key'), () => client('service-key'));
	const actor = createTestAuthContext({ orgId, userId });
	const outcome = async (operation: Promise<unknown>) => {
		try {
			await operation;
			return { status: 200 };
		} catch (error) {
			try {
				rethrowOrWrap(error);
			} catch (mapped) {
				if (isHttpError(mapped)) return { status: mapped.status, message: mapped.body.message };
				throw mapped;
			}
			throw error;
		}
	};
	const receipt = (name: string) => controls.command('fault-state').controls[name];
	const phase = async (name: string, expected: string) => {
		for (let attempt = 0; attempt < 200 && receipt(name).phase !== expected; attempt++)
			await new Promise((resolve) => setImmediate(resolve));
		expect(receipt(name).phase).toBe(expected);
	};
	return {
		...stateful,
		controls,
		scans,
		actor,
		outcome,
		receipt,
		phase,
		replace: (file: File, path: string) => scans.replace(actor, rosterId, path, file)
	};
}

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('roster lost-reply controls through the real SDK, provider and HTTP error mapping', () => {
	it('reports a committed scan displaced before settlement as unconfirmed and keeps only the newer scan', async () => {
		const run = harness();
		run.controls.command('fault-arm', { name: 'roster-scan-attach-lost-ack' });
		run.state.beforeSettle = () => {
			run.state.files.set(pathL, 'l bytes');
			run.state.retired.add(pathK);
			run.state.pointer = pathL;
		};
		expect(await run.outcome(run.replace(pdf('k'), pathK))).toEqual({ status: 503, message: UNCONFIRMED });
		expect(run.state.pointer).toBe(pathL);
		expect([...run.state.files.keys()].sort()).toEqual([oldPath, pathL].sort());
		expect(run.state.registrations.size).toBe(0);
		expect(run.receipt('roster-scan-attach-lost-ack')).toMatchObject({
			phase: 'faulted',
			call: { providerStatus: 200 }
		});
	});

	it('recovers a committed scan that is still current after its reply is lost', async () => {
		const run = harness();
		run.controls.command('fault-arm', { name: 'roster-scan-attach-lost-ack' });
		expect(await run.outcome(run.replace(pdf('k'), pathK))).toEqual({ status: 200 });
		expect(run.state.pointer).toBe(pathK);
		expect(run.state.files.get(pathK)).toBe('%PDF-1.7 k');
		expect(run.state.registrations.size).toBe(0);
		expect(run.state.attachCalls).toBe(1);
	});

	it.each([
		[
			'roster-scan-remove-lost-ack',
			(run: ReturnType<typeof harness>) => run.scans.remove(run.actor, rosterId, oldPath)
		],
		['roster-delete-lost-ack', (run: ReturnType<typeof harness>) => run.scans.deleteRoster(run.actor, rosterId)]
	])('reports %s as unconfirmed after the command committed', async (name, command) => {
		const run = harness();
		run.controls.command('fault-arm', { name });
		expect(await run.outcome(command(run))).toEqual({ status: 503, message: UNCONFIRMED });
		expect(run.state.pointer).toBeNull();
		expect(run.state.retired.has(oldPath)).toBe(true);
		expect(run.receipt(name)).toMatchObject({ phase: 'faulted', call: { providerStatus: 200 } });
	});

	it('lets a repeated Delete after a lost reply find the roster gone', async () => {
		const run = harness();
		run.controls.command('fault-arm', { name: 'roster-delete-lost-ack' });
		await run.outcome(run.scans.deleteRoster(run.actor, rosterId));
		expect(await run.outcome(run.scans.deleteRoster(run.actor, rosterId))).toEqual({
			status: 404,
			message: 'This roster is no longer available.'
		});
	});

	it('keeps a pre-dispatch denial visible as a generic failure with no provider commit', async () => {
		const run = harness();
		run.controls.command('fault-arm', { name: 'roster-scan-attach' });
		expect(await run.outcome(run.replace(pdf('k'), pathK))).toEqual({ status: 500, message: 'Internal server error' });
		expect(run.state.attachCalls).toBe(0);
		expect(run.state.pointer).toBe(oldPath);
		expect(run.state.files.has(pathK)).toBe(false);
		expect(run.state.registrations.size).toBe(0);
		expect(run.receipt('roster-scan-attach').call).toEqual({
			method: 'POST',
			path: '/rest/v1/rpc/attach_sign_in_roster_scan'
		});
	});

	it('returns a definitive provider abort untouched so it stays a not-saved failure', async () => {
		const run = harness();
		run.state.attachFailure = { code: '40P01', message: 'deadlock detected' };
		run.controls.command('fault-arm', { name: 'roster-scan-attach-lost-ack' });
		expect(await run.outcome(run.replace(pdf('k'), pathK))).toEqual({ status: 503, message: NOT_SAVED });
		expect(run.receipt('roster-scan-attach-lost-ack')).toMatchObject({
			phase: 'provider-failed',
			call: { providerStatus: 400 }
		});
		expect(run.state.pointer).toBe(oldPath);
	});

	it('does not touch an unrelated request while a lost reply is armed', async () => {
		const run = harness();
		run.controls.command('fault-arm', { name: 'roster-scan-attach-lost-ack' });
		expect(await run.outcome(run.scans.remove(run.actor, rosterId, oldPath))).toEqual({ status: 200 });
		expect(run.receipt('roster-scan-attach-lost-ack')).toMatchObject({ phase: 'armed', matches: 0 });
	});
});

describe('roster attach pause after commit', () => {
	const name = 'roster-scan-attach-committed-hold';

	it('admits a second scan while the first is committed and paused, then loses the first reply on release', async () => {
		const run = harness();
		run.controls.command('fault-arm', { name });
		const first = run.outcome(run.replace(pdf('k'), pathK));
		await run.phase(name, 'committed-held');
		expect(run.state.pointer).toBe(pathK);
		expect(run.receipt(name).call).toEqual({
			method: 'POST',
			path: '/rest/v1/rpc/attach_sign_in_roster_scan',
			providerStatus: 200
		});

		expect(await run.outcome(run.replace(pdf('l'), pathL))).toEqual({ status: 200 });
		expect(run.state.pointer).toBe(pathL);
		expect(run.receipt(name).phase).toBe('committed-held');

		run.controls.command('fault-release', { name });
		expect(await first).toEqual({ status: 503, message: UNCONFIRMED });
		expect(run.state.pointer).toBe(pathL);
		expect(run.state.files.get(pathL)).toBe('%PDF-1.7 l');
		expect(run.state.files.has(pathK)).toBe(false);
		expect(run.state.retired.has(pathK)).toBe(true);
		expect(run.state.registrations.size).toBe(0);
		expect(run.receipt(name)).toMatchObject({
			phase: 'faulted',
			call: { providerStatus: 200, releaseReason: 'released' }
		});
	});

	it('settles a paused scan that nothing displaced as the current attachment', async () => {
		const run = harness();
		run.controls.command('fault-arm', { name });
		const first = run.outcome(run.replace(pdf('k'), pathK));
		await run.phase(name, 'committed-held');
		run.controls.command('fault-release', { name });
		expect(await first).toEqual({ status: 200 });
		expect(run.state.pointer).toBe(pathK);
		expect(run.state.registrations.size).toBe(0);
	});

	it('releases a pending pause on restore with a transport loss and no later match', async () => {
		const run = harness();
		run.controls.command('fault-arm', { name });
		const first = run.outcome(run.replace(pdf('k'), pathK));
		await run.phase(name, 'committed-held');
		run.controls.command('fault-restore');
		expect(await first).toEqual({ status: 200 });
		expect(run.controls.command('fault-state').lastControls[name]).toMatchObject({
			phase: 'faulted',
			call: { providerStatus: 200, releaseReason: 'restored' }
		});
		expect(await run.outcome(run.replace(pdf('l'), pathL))).toEqual({ status: 200 });
	});

	it('pauses only the targeted attach and returns a failed commit unpaused', async () => {
		const run = harness();
		run.state.attachFailure = { code: '40P01', message: 'deadlock detected' };
		run.controls.command('fault-arm', { name });
		expect(await run.outcome(run.replace(pdf('k'), pathK))).toEqual({ status: 503, message: NOT_SAVED });
		expect(run.receipt(name)).toMatchObject({ phase: 'provider-failed', call: { providerStatus: 400 } });
	});
});
