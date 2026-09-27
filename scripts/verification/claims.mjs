import { randomUUID } from 'node:crypto';
import { checked, provider } from './fixtures.mjs';
import { Blocked, sleep } from './core.mjs';

export const claimNames = ['group-persistence', 'group-authorization', 'personnel-scope'];
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
	async function login(role) {
		const actor = fixture.actors[role];
		if (!actor) throw new Blocked('FIXTURE', 'Choose manager, viewer, scoped, or foreign.');
		// A new isolated browser context uses normal password sign-in, never injected cookies.
		const result = textContent(
			await call('new_page', {
				url: `${state.origin}/auth/login?next=/org/${role === 'foreign' ? fixture.ids.orgB : fixture.ids.orgA}/personnel`,
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
		await tool('wait_for', { text: ['Able, Synthetic', 'Foreign, Synthetic'], timeout: 20000 });
		return { pageId, role, origin: state.origin };
	}
	return { tool, snapshot, uid, evaluate, login };
}

export async function prove(claim, session, state, fixture, call) {
	if (!claimNames.includes(claim))
		throw new Blocked(
			'CLAIM',
			`Unknown required claim ${claim}. Available: ${claimNames.join(', ')}. No proof was substituted.`
		);
	const drive = driver(call, state, fixture);
	const service = await provider(session);
	const observations = [];
	const role = claim === 'group-persistence' ? 'manager' : claim === 'group-authorization' ? 'viewer' : 'scoped';
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
		} else {
			await drive.login('scoped');
			const source = await drive.snapshot();
			expect(
				source.includes('Able, Synthetic') &&
					!['Baker, Synthetic', 'Unassigned, Synthetic', 'Foreign, Synthetic'].some((name) => source.includes(name)),
				{ expected: 'Personnel UI contains Able and excludes other Group, unassigned, and foreign Personnel' }
			);
			const knownIds = ['personA', 'personB', 'personUnassigned', 'personForeign'].map((key) => fixture.ids[key]);
			const actual = await drive.evaluate(
				`async () => { const r = await fetch(location.pathname + '/__data.json'); const body = await r.text(); return {status:r.status,ids:${JSON.stringify(knownIds)}.filter(id => body.includes(id))}; }`
			);
			expect(actual.status === 200 && actual.ids.length === 1 && actual.ids[0] === fixture.ids.personA, {
				expectedIds: [fixture.ids.personA],
				status: actual.status,
				observedIds: actual.ids
			});
		}
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
