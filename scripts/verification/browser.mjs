import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Blocked, sleep } from './core.mjs';

// Reuse normally signed-in isolated contexts within one owned browser.
const actorPages = new Map();

export function assertOwnedNavigation(name, args, ownedOrigins) {
	if (!['navigate_page', 'new_page'].includes(name) || args.url === undefined) return;
	let url;
	try {
		url = new URL(args.url);
	} catch {
		// Invalid URLs fail the same ownership boundary as foreign targets.
	}
	if (!url || url.username || url.password || !ownedOrigins.includes(url.origin))
		throw new Blocked(
			'URL_NOT_OWNED',
			'Navigation requires an absolute URL on the owned app or provider origin, without credentials. Use doctor for the app origin.'
		);
}

// Recordings are evidence: they stay under the owned evidence directory as .webm or .mp4.
export async function assertRecordingPath(name, args, evidenceDirectory) {
	if (name !== 'screencast_start') return;
	const file = typeof args.filePath === 'string' ? args.filePath : '';
	if (!/\.(webm|mp4)$/i.test(file) || !(await isUnderEvidence(file, evidenceDirectory)))
		throw new Blocked(
			'RECORDING_PATH',
			'screencast_start needs a filePath ending in .webm or .mp4 under .verification/evidence/.'
		);
}

// Judged by the real path of the nearest existing ancestor, so a symlinked folder cannot point a write elsewhere.
export async function isUnderEvidence(file, evidenceDirectory) {
	const [target, evidence] = await Promise.all([
		realTarget(path.resolve(file)),
		realTarget(path.resolve(evidenceDirectory))
	]);
	return Boolean(target && evidence) && target.startsWith(evidence + path.sep);
}

async function realTarget(file) {
	let existing = file;
	while (true) {
		try {
			return path.join(await fs.realpath(existing), path.relative(existing, file));
		} catch (error) {
			if (error.code !== 'ENOENT' || path.dirname(existing) === existing) throw error;
			// A dangling symlink has no real location yet; a write through it lands wherever it points.
			if (
				await fs.lstat(existing).then(
					(stat) => stat.isSymbolicLink(),
					() => false
				)
			)
				return null;
			existing = path.dirname(existing);
		}
	}
}

export const textContent = (result) =>
	result.content
		?.filter((item) => item.type === 'text')
		.map((item) => item.text)
		.join('\n') ?? '';

export function driver(call, state, fixture) {
	let pageId;
	async function tool(name, args = {}) {
		return call(name, { ...(pageId === undefined ? {} : { pageId }), ...args });
	}
	async function snapshot() {
		return textContent(await tool('take_snapshot'));
	}
	async function uid(role, name) {
		const source = await snapshot();
		const match = source.split('\n').filter((line) => line.includes(`${role} ${JSON.stringify(name)}`));
		if (match.length !== 1)
			throw new Blocked(
				'LOCATOR',
				`Expected one ${role} named ${name}; found ${match.length}. Inspect take_snapshot; distinguish map drift from product failure.`
			);
		return match[0].match(/uid=([^\s]+)/)?.[1];
	}
	async function evaluate(fn) {
		const result = textContent(await tool('evaluate_script', { function: fn }));
		const block = result.match(/```json\s*([\s\S]*?)```/);
		if (!block)
			throw new Blocked('MCP_FORMAT', 'DevTools evaluation response format changed; inspect native tool output.');
		return JSON.parse(block[1]);
	}
	async function login(role, options = {}) {
		const actor = fixture.actors[role];
		if (!actor) throw new Blocked('FIXTURE', `Unknown synthetic actor ${role}.`);
		const orgId = fixture.ids[actor.organization ?? (role === 'foreign' ? 'orgB' : 'orgA')];
		const destination = options.path ?? 'personnel';
		const target = `/org/${orgId}/${destination}`;
		const cacheKey = `${state.origin}:${role}`;
		const existing = actorPages.get(cacheKey);
		if (existing) {
			pageId = existing.pageId;
			const pages = textContent(await call('list_pages'));
			if (pages.split('\n').some((line) => line.startsWith(`${pageId}:`))) {
				// A cached page may have signed out or expired since our last command.
				// Request the protected destination again so normal server admission runs.
				await navigate(target);
				if ((await evaluate('() => location.pathname')) === target) {
					await tool('wait_for', {
						text: options.readyText ?? ['Able, Synthetic', 'Foreign, Synthetic'],
						timeout: 20000
					});
					return { pageId, role, origin: state.origin, orgId };
				}
			}
			actorPages.delete(cacheKey);
		}
		// A new isolated browser context uses normal password sign-in, never injected cookies.
		const result = textContent(
			await call('new_page', {
				url: `${state.origin}/auth/login?next=${target}`,
				isolatedContext: `verify-${role}-${randomUUID()}`
			})
		);
		pageId = Number(
			result
				.split('\n')
				.find((line) => line.includes('[selected]'))
				?.match(/^(\d+):/)?.[1]
		);
		if (!Number.isInteger(pageId))
			throw new Blocked('PAGE_ID', 'DevTools did not return a page ID; inspect new_page response.');
		await tool('fill', { uid: await uid('textbox', 'Email Address'), value: actor.email });
		await tool('fill', { uid: await uid('textbox', 'Password'), value: actor.password });
		await tool('click', { uid: await uid('button', 'Sign In') });
		await tool('wait_for', { text: options.readyText ?? ['Able, Synthetic', 'Foreign, Synthetic'], timeout: 20000 });
		actorPages.set(cacheKey, { pageId, path: target });
		return { pageId, role, origin: state.origin, orgId };
	}
	async function navigate(path, readyText) {
		for (let attempt = 0; attempt < 3; attempt++) {
			await tool('navigate_page', { type: 'url', url: `${state.origin}${path}` });
			for (const actor of actorPages.values()) if (actor.pageId === pageId) actor.path = path;
			try {
				if (readyText) await tool('wait_for', { text: readyText, timeout: 20000 });
				const source = await snapshot();
				if (!source.includes('Too many requests')) return source;
			} catch (error) {
				if (!(await snapshot()).includes('Too many requests')) throw error;
			}
			const limit = await evaluate(`async () => {
				const response = await fetch(location.href);
				return { status: response.status, retryAfter: response.headers.get('Retry-After') };
			}`);
			if (limit.status === 200) continue;
			const seconds = Number(limit.retryAfter);
			if (limit.status !== 429 || !Number.isFinite(seconds) || seconds < 1 || seconds > 61)
				throw new Blocked(
					'RATE_LIMIT',
					`Calendar navigation received 429 with unusable Retry-After: ${JSON.stringify(limit)}.`
				);
			await sleep(seconds * 1000 + 250);
		}
		throw new Blocked('RATE_LIMIT', `Calendar navigation ${path} remained rate-limited after Retry-After pacing.`);
	}
	async function reload() {
		const path = await evaluate('() => location.pathname + location.search');
		return navigate(path);
	}
	async function request(method, path, body) {
		return evaluate(`async () => {
			const response = await fetch(${JSON.stringify(path)}, {
				method: ${JSON.stringify(method)},
				headers: { 'Content-Type': 'application/json' },
				${body === undefined ? '' : `body: JSON.stringify(${JSON.stringify(body)})`}
			});
			return { status: response.status, body: await response.text(), retryAfter: response.headers.get('Retry-After') };
		}`);
	}
	return { tool, snapshot, uid, evaluate, login, navigate, reload, request };
}
