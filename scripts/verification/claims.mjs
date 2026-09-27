import { randomUUID } from 'node:crypto';
import { checked, provider } from './fixtures.mjs';
import { Blocked, sleep } from './core.mjs';

const calendarClaimNames = [
	'calendar-availability-lifecycle',
	'calendar-availability-bulk',
	'calendar-availability-scope',
	'calendar-status-type-lifecycle',
	'calendar-assignment-type-lifecycle',
	'calendar-special-day-lifecycle',
	'calendar-catalog-authorization',
	'calendar-availability-consumers',
	'calendar-state-isolation'
];
// The owned browser lives across prove calls. Reuse each normally signed-in
// actor context so the complete claim set stays within ordinary login limits.
const actorPages = new Map();

export const claimNames = [
	'group-persistence',
	'group-authorization',
	'personnel-scope',
	'personnel-organization-scope',
	...calendarClaimNames
];
class ClaimFailure extends Error {}
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
		const orgId =
			fixture.calendarActors?.[role]?.organization === 'orgB' || role === 'foreign'
				? fixture.ids.orgB
				: fixture.ids.orgA;
		const destination = options.path ?? 'personnel';
		const target = `/org/${orgId}/${destination}`;
		const cacheKey = `${state.origin}:${role}`;
		const existing = actorPages.get(cacheKey);
		if (existing) {
			pageId = existing.pageId;
			if (existing.path !== target) {
				await navigate(target, options.readyText ?? ['Able, Synthetic', 'Foreign, Synthetic']);
				existing.path = target;
			}
			return { pageId, role, origin: state.origin, orgId };
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
				return snapshot();
			} catch (error) {
				if (!(await snapshot()).includes('Too many requests')) throw error;
				const limit = await evaluate(`async () => {
					const response = await fetch(location.href);
					return { status: response.status, retryAfter: response.headers.get('Retry-After') };
				}`);
				const seconds = Number(limit.retryAfter);
				if (limit.status !== 429 || !Number.isFinite(seconds) || seconds < 1 || seconds > 61)
					throw new Blocked(
						'RATE_LIMIT',
						`Calendar navigation received 429 with unusable Retry-After: ${JSON.stringify(limit)}.`
					);
				await sleep(seconds * 1000 + 250);
			}
		}
		throw new Blocked('RATE_LIMIT', `Calendar navigation ${path} remained rate-limited after Retry-After pacing.`);
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
	return { tool, snapshot, uid, evaluate, login, navigate, request };
}

export async function prove(claim, session, state, fixture, call) {
	if (!claimNames.includes(claim))
		throw new Blocked(
			'CLAIM',
			`Unknown required claim ${claim}. Available: ${claimNames.join(', ')}. No proof was substituted.`
		);
	const drive = driver(call, state, fixture);
	const service = await provider(session);
	if (calendarClaimNames.includes(claim)) {
		const { proveCalendarClaim } = await import('./calendar-claims.mjs');
		return proveCalendarClaim(claim, { drive, service, fixture });
	}
	const observations = [];
	const role = claim === 'group-persistence' ? 'manager' : claim === 'personnel-scope' ? 'scoped' : 'viewer';
	const scope = { role, organizationId: fixture.ids.orgA, groupIds: role === 'scoped' ? [fixture.ids.groupA] : null };
	const expect = (condition, detail) => {
		observations.push({ ...detail, observed: condition });
		if (!condition) {
			const error = new ClaimFailure('Behavior disagrees with the approved contract.');
			error.observations = observations;
			throw error;
		}
	};
	try {
		if (claim === 'group-persistence') {
			await drive.login('manager');
			await drive.tool('click', { uid: await drive.uid('button', 'Manage Groups') });
			const name = `Saved ${randomUUID()}`;
			await drive.tool('fill', { uid: await drive.uid('textbox', 'Organization groups'), value: name });
			await drive.tool('click', { uid: await drive.uid('button', 'Add') });
			let rows = [];
			for (let attempt = 0; attempt < 30; attempt++) {
				rows = checked(
					await service
						.from('groups')
						.select('id,name,organization_id')
						.eq('organization_id', fixture.ids.orgA)
						.eq('name', name)
				);
				if (rows.length) break;
				await sleep(100);
			}
			expect(rows.length === 1, {
				expected: 'Exactly one Group saved with the submitted name in Organization A',
				observedRows: rows
			});
			await drive.tool('navigate_page', { type: 'reload' });
			await drive.tool('wait_for', { text: ['Manage Groups'], timeout: 15000 });
			await drive.tool('click', { uid: await drive.uid('button', 'Manage Groups') });
			expect((await drive.snapshot()).includes(name), {
				expected: 'Saved Group survives full reload',
				savedId: rows[0].id
			});
		} else if (claim === 'group-authorization') {
			await drive.login('viewer');
			for (const org of [fixture.ids.orgA, fixture.ids.orgB]) {
				const name = `Denied ${randomUUID()}`;
				const response = await drive.evaluate(
					`async () => { const r = await fetch(${JSON.stringify(`/org/${org}/api/groups`)}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:${JSON.stringify(name)}})}); return {status:r.status}; }`
				);
				const rows = checked(await service.from('groups').select('id,organization_id').eq('name', name));
				// Denial may conceal a foreign Organization's existence (404).
				const denied = org === fixture.ids.orgA ? response.status === 403 : [403, 404].includes(response.status);
				expect(denied && rows.length === 0, {
					expected:
						org === fixture.ids.orgA ? '403 and no saved effect' : 'Access denied (403/404) and no saved effect',
					organization: org,
					response,
					savedRows: rows
				});
			}
		} else if (claim === 'personnel-scope' || claim === 'personnel-organization-scope') {
			await drive.login(role);
			const source = await drive.snapshot();
			const organizationWide = claim === 'personnel-organization-scope';
			const visible = organizationWide
				? ['Able, Synthetic', 'Baker, Synthetic', 'Unassigned, Synthetic']
				: ['Able, Synthetic'];
			const hidden = organizationWide
				? ['Foreign, Synthetic']
				: ['Baker, Synthetic', 'Unassigned, Synthetic', 'Foreign, Synthetic'];
			expect(visible.every((name) => source.includes(name)) && hidden.every((name) => !source.includes(name)), {
				expectedVisible: visible,
				expectedHidden: hidden
			});
			const knownIds = ['personA', 'personB', 'personUnassigned', 'personForeign'].map((key) => fixture.ids[key]);
			const expectedIds = organizationWide
				? [fixture.ids.personA, fixture.ids.personB, fixture.ids.personUnassigned]
				: [fixture.ids.personA];
			const actual = await drive.evaluate(
				`async () => { const r = await fetch(location.pathname + '/__data.json'); const body = await r.text(); return {status:r.status,ids:${JSON.stringify(knownIds)}.filter(id => body.includes(id))}; }`
			);
			expect(
				actual.status === 200 &&
					actual.ids.length === expectedIds.length &&
					expectedIds.every((id) => actual.ids.includes(id)),
				{
					expectedIds,
					status: actual.status,
					observedIds: actual.ids
				}
			);
		} else throw new Blocked('CLAIM', `No implementation for ${claim}; add and baseline its check before refactoring.`);
		return { status: 'PASS', claim, scope, observations };
	} catch (error) {
		return {
			status: error instanceof ClaimFailure ? 'FAIL' : 'INCONCLUSIVE',
			claim,
			scope,
			code: error.code ?? 'CONTRACT_MISMATCH',
			message: error.message,
			observations: error.observations ?? observations
		};
	}
}
