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

it('signs a synthetic actor in through the visible login form before returning its page', async () => {
	const state = { origin: `http://127.0.0.1:4100/${randomUUID()}` };
	const fixture = {
		actors: { manager: { email: 'manager@example.test', password: 'Synthetic-only' } },
		ids: { orgA: 'organization-a' }
	};
	const fields = new Map();
	let submitted = false;
	let ready = false;
	const call = async (name: string, args: Record<string, unknown>) => {
		if (name === 'new_page') {
			expect(args.url).toBe(`${state.origin}/auth/login?next=/org/organization-a/personnel`);
			return { content: [{ type: 'text', text: '7: Login [selected]' }] };
		}
		expect(args.pageId).toBe(7);
		if (name === 'take_snapshot')
			return {
				content: [
					{
						type: 'text',
						text: 'uid=email textbox "Email Address"\nuid=password textbox "Password"\nuid=submit button "Sign In"'
					}
				]
			};
		if (name === 'fill') fields.set(args.uid, args.value);
		else if (name === 'click') {
			expect(args.uid).toBe('submit');
			submitted = fields.get('email') === 'manager@example.test' && fields.get('password') === 'Synthetic-only';
		} else if (name === 'wait_for') {
			if (!submitted) throw new Error('No normal sign-in submitted');
			ready = true;
		} else throw new Error(`Unexpected login operation: ${name}`);
		return {};
	};
	const result = await driver(call, state, fixture).login('manager');
	expect(ready).toBe(true);
	expect(result).toMatchObject({ pageId: 7, role: 'manager', orgId: 'organization-a' });
});

it('reports unavailable page control and unknown actors without fabricating a login', async () => {
	const fixture = { actors: { manager: { email: 'manager@example.test', password: 'Synthetic-only' } }, ids: {} };
	const unavailable = async () => ({ content: [{ type: 'text', text: 'No browser page available' }] });
	const control = driver(unavailable, { origin: `http://127.0.0.1/${randomUUID()}` }, fixture);
	await expect(control.login('manager')).rejects.toMatchObject({ code: 'PAGE_ID' });
	await expect(control.login('absent')).rejects.toMatchObject({ code: 'FIXTURE' });
});

it('reuses an admitted page but signs in normally again after logout or a closed page', async () => {
	const fixture = {
		actors: { manager: { email: 'manager@example.test', password: 'Synthetic-only' } },
		ids: { orgA: 'organization-a' }
	};
	const state = { origin: `http://127.0.0.1:4100/${randomUUID()}` };
	const target = '/org/organization-a/personnel';
	const pages = new Map<number, { authenticated: boolean; path: string; fields: Map<unknown, unknown> }>();
	let nextPageId = 7;
	let submittedLogins = 0;
	const result = (text: string) => ({ content: [{ type: 'text', text }] });
	const call = async (name: string, args: Record<string, unknown> = {}) => {
		if (name === 'list_pages') return result([...pages.keys()].map((id) => `${id}: Owned page`).join('\n'));
		if (name === 'new_page') {
			const id = nextPageId++;
			pages.set(id, { authenticated: false, path: '/auth/login', fields: new Map() });
			return result(`${id}: Login [selected]`);
		}
		const page = pages.get(Number(args.pageId));
		if (!page) throw new Error('Page was closed');
		if (name === 'navigate_page') page.path = page.authenticated ? target : '/auth/login';
		else if (name === 'evaluate_script') {
			const value = runInNewContext(`(${args.function})()`, { location: { pathname: page.path } });
			return result('```json\n' + JSON.stringify(value) + '\n```');
		} else if (name === 'take_snapshot')
			return result(
				page.authenticated
					? 'uid=person StaticText "Able, Synthetic"'
					: 'uid=email textbox "Email Address"\nuid=password textbox "Password"\nuid=submit button "Sign In"'
			);
		else if (name === 'fill') page.fields.set(args.uid, args.value);
		else if (name === 'click') {
			if (
				args.uid !== 'submit' ||
				page.fields.get('email') !== 'manager@example.test' ||
				page.fields.get('password') !== 'Synthetic-only'
			)
				throw new Error('Normal login requires both credentials');
			page.authenticated = true;
			page.path = target;
			submittedLogins++;
		} else if (name === 'wait_for') {
			if (!page.authenticated || page.path !== target) throw new Error('Protected content unavailable');
		} else throw new Error(`Unexpected browser operation: ${name}`);
		return result('');
	};
	const control = driver(call, state, fixture);
	const initial = await control.login('manager');
	expect((await control.login('manager')).pageId).toBe(initial.pageId);
	expect(submittedLogins).toBe(1);
	pages.get(initial.pageId)!.authenticated = false;
	pages.get(initial.pageId)!.path = '/auth/login';
	const afterLogout = await control.login('manager');
	expect(pages.get(afterLogout.pageId)?.authenticated).toBe(true);
	expect(submittedLogins).toBe(2);
	pages.delete(afterLogout.pageId);
	const afterClose = await control.login('manager');
	expect(pages.get(afterClose.pageId)?.authenticated).toBe(true);
	expect(submittedLogins).toBe(3);
});
