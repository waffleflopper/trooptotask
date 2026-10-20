import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { assertOwnedNavigation, assertRecordingPath, driver, isUnderEvidence } from './browser.mjs';

const origins = ['http://127.0.0.1:4100', 'http://127.0.0.1:5400'];

it('permits only owned absolute navigation while retaining native reload and inspection', () => {
	for (const tool of ['new_page', 'navigate_page']) {
		for (const origin of origins)
			expect(() => assertOwnedNavigation(tool, { url: `${origin}/auth/login` }, origins)).not.toThrow();
		for (const url of [
			'https://example.com',
			'http://127.0.0.1:9999',
			'http://synthetic:secret@127.0.0.1:4100',
			'/auth/login',
			'not a URL'
		])
			expect(() => assertOwnedNavigation(tool, { url }, origins)).toThrowError(
				expect.objectContaining({ code: 'URL_NOT_OWNED' })
			);
	}
	expect(() => assertOwnedNavigation('navigate_page', { type: 'reload' }, origins)).not.toThrow();
	expect(() => assertOwnedNavigation('take_snapshot', { pageId: 7 }, origins)).not.toThrow();
});

it('admits a recording only as a webm or mp4 under the owned evidence directory', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'recording-kinds-'));
	const evidence = path.join(root, 'evidence');
	await mkdir(evidence);
	for (const filePath of [
		`${evidence}/verify-trooptotask/run/sweep.webm`,
		`${evidence}/verify-trooptotask/run/sweep.MP4`
	])
		await expect(assertRecordingPath('screencast_start', { filePath }, evidence)).resolves.toBeUndefined();
	for (const args of [
		{},
		{ filePath: '/tmp/sweep.webm' },
		{ filePath: `${evidence}/../browsers/sweep.webm` },
		{ filePath: `${evidence}-other/sweep.webm` },
		{ filePath: `${evidence}/run/sweep.gif` }
	])
		await expect(assertRecordingPath('screencast_start', args, evidence)).rejects.toMatchObject({
			code: 'RECORDING_PATH'
		});
	await expect(assertRecordingPath('screencast_stop', {}, evidence)).resolves.toBeUndefined();
	await rm(root, { recursive: true, force: true });
});

it('refuses a recording whose evidence folder is a symlink to somewhere else', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'recording-path-'));
	const evidence = path.join(root, 'evidence');
	await mkdir(path.join(root, 'outside'));
	await mkdir(evidence);
	await symlink(path.join(root, 'outside'), path.join(evidence, 'escape'));
	try {
		await expect(
			assertRecordingPath('screencast_start', { filePath: path.join(evidence, 'escape/sweep.webm') }, evidence)
		).rejects.toMatchObject({ code: 'RECORDING_PATH' });
		await expect(
			assertRecordingPath('screencast_start', { filePath: path.join(evidence, 'run/sweep.webm') }, evidence)
		).resolves.toBeUndefined();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it('judges an evidence folder by its real location, so a symlinked run folder is outside', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'evidence-path-'));
	const evidence = path.join(root, 'evidence');
	await mkdir(path.join(root, 'outside'));
	await mkdir(evidence);
	await symlink(path.join(root, 'outside'), path.join(evidence, 'escape'));
	try {
		expect(await isUnderEvidence(path.join(evidence, 'escape/new-run'), evidence)).toBe(false);
		expect(await isUnderEvidence(path.join(evidence, 'run/new-run'), evidence)).toBe(true);
		expect(await isUnderEvidence(evidence, evidence)).toBe(false);
		expect(await isUnderEvidence(path.join(evidence, '../outside/new-run'), evidence)).toBe(false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it('refuses a recording or run folder that is a dangling symlink to somewhere outside', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'dangling-path-'));
	const evidence = path.join(root, 'evidence');
	await mkdir(path.join(evidence, 'run'), { recursive: true });
	await symlink(path.join(root, 'outside/sweep.webm'), path.join(evidence, 'run/sweep.webm'));
	await symlink(path.join(root, 'outside/new-run'), path.join(evidence, 'run/new-run'));
	try {
		await expect(
			assertRecordingPath('screencast_start', { filePath: path.join(evidence, 'run/sweep.webm') }, evidence)
		).rejects.toMatchObject({ code: 'RECORDING_PATH' });
		expect(await isUnderEvidence(path.join(evidence, 'run/new-run'), evidence)).toBe(false);
		expect(await isUnderEvidence(path.join(evidence, 'run/new-run/deeper'), evidence)).toBe(false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it('refuses a path that climbs out through a symlink with ..', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'climb-path-'));
	const evidence = path.join(root, 'evidence');
	await mkdir(path.join(root, 'outside/sub'), { recursive: true });
	await mkdir(evidence);
	await symlink(path.join(root, 'outside/sub'), path.join(evidence, 'escape'));
	try {
		await expect(
			assertRecordingPath('screencast_start', { filePath: `${evidence}/escape/../escaped.webm` }, evidence)
		).rejects.toMatchObject({ code: 'RECORDING_PATH' });
		expect(await isUnderEvidence(`${evidence}/escape/../new-run`, evidence)).toBe(false);
		expect(await isUnderEvidence(`${evidence}/run/../run/new-run`, evidence)).toBe(false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it('accepts a path under an evidence root that is not created yet, but not under a dangling one', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'missing-root-'));
	const evidence = path.join(root, '.verification/evidence');
	const dangling = path.join(root, 'dangling-evidence');
	await symlink(path.join(root, 'missing'), dangling);
	try {
		await expect(
			assertRecordingPath('screencast_start', { filePath: `${evidence}/verify-trooptotask/run/a.webm` }, evidence)
		).resolves.toBeUndefined();
		expect(await isUnderEvidence(`${evidence}/verify-trooptotask/run`, evidence)).toBe(true);
		expect(await isUnderEvidence(`${dangling}/run`, dangling)).toBe(false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it('opens a provider-session page for a synthetic actor and navigates it to the destination', async () => {
	const state = { origin: `http://127.0.0.1:4100/${randomUUID()}` };
	const fixture = {
		actors: { manager: { email: 'manager@example.test', password: 'Synthetic-only' } },
		ids: { orgA: 'organization-a' }
	};
	const sessions: Record<string, unknown>[] = [];
	const sessionPage = async (input: Record<string, unknown>) => {
		sessions.push(input);
		return { status: 'PASS', pageId: 7, path: '/org/organization-a/personnel' };
	};
	const operations: string[] = [];
	const call = async (name: string, args: Record<string, unknown>) => {
		expect(args.pageId).toBe(7);
		operations.push(name === 'navigate_page' ? `${name} ${args.url}` : name);
		return {};
	};
	const result = await driver(call, state, fixture, sessionPage).login('manager');
	expect(sessions).toEqual([
		{
			email: 'manager@example.test',
			password: 'Synthetic-only',
			destination: '/org/organization-a/personnel',
			isolatedContext: expect.stringMatching(/^verify-manager-/)
		}
	]);
	expect(operations).toEqual([`navigate_page ${state.origin}/org/organization-a/personnel`, 'wait_for']);
	expect(result).toEqual({ pageId: 7, role: 'manager', origin: state.origin, orgId: 'organization-a' });
});

it('reports an unknown actor without opening a session', async () => {
	const fixture = { actors: { manager: { email: 'manager@example.test', password: 'Synthetic-only' } }, ids: {} };
	const opened: unknown[] = [];
	const control = driver(
		async () => ({}),
		{ origin: `http://127.0.0.1/${randomUUID()}` },
		fixture,
		async (input) => {
			opened.push(input);
			return { pageId: 1, path: '/' };
		}
	);
	await expect(control.login('absent')).rejects.toMatchObject({ code: 'FIXTURE' });
	expect(opened).toEqual([]);
});

it('reuses an admitted page but opens a new session after logout or a closed page', async () => {
	const fixture = {
		actors: { manager: { email: 'manager@example.test', password: 'Synthetic-only' } },
		ids: { orgA: 'organization-a' }
	};
	const state = { origin: `http://127.0.0.1:4100/${randomUUID()}` };
	const target = '/org/organization-a/personnel';
	const pages = new Map<number, { authenticated: boolean; path: string }>();
	let nextPageId = 7;
	let sessions = 0;
	const sessionPage = async () => {
		const id = nextPageId++;
		pages.set(id, { authenticated: true, path: '/og-image.png' });
		sessions++;
		return { pageId: id, path: target };
	};
	const result = (text: string) => ({ content: [{ type: 'text', text }] });
	const call = async (name: string, args: Record<string, unknown> = {}) => {
		if (name === 'list_pages') return result([...pages.keys()].map((id) => `${id}: Owned page`).join('\n'));
		const page = pages.get(Number(args.pageId));
		if (!page) throw new Error('Page was closed');
		if (name === 'navigate_page') page.path = page.authenticated ? target : '/auth/login';
		else if (name === 'evaluate_script') {
			const value = runInNewContext(`(${args.function})()`, { location: { pathname: page.path } });
			return result('```json\n' + JSON.stringify(value) + '\n```');
		} else if (name === 'take_snapshot')
			return result(page.authenticated ? 'uid=person StaticText "Able, Synthetic"' : 'uid=submit button "Sign In"');
		else if (name === 'wait_for') {
			if (!page.authenticated || page.path !== target) throw new Error('Protected content unavailable');
		} else throw new Error(`Unexpected browser operation: ${name}`);
		return result('');
	};
	const control = driver(call, state, fixture, sessionPage);
	const initial = await control.login('manager');
	expect((await control.login('manager')).pageId).toBe(initial.pageId);
	expect(sessions).toBe(1);
	pages.get(initial.pageId)!.authenticated = false;
	const afterLogout = await control.login('manager');
	expect(afterLogout.pageId).toBe(8);
	expect(sessions).toBe(2);
	pages.delete(afterLogout.pageId);
	const afterClose = await control.login('manager');
	expect(afterClose.pageId).toBe(9);
	expect(sessions).toBe(3);
});
