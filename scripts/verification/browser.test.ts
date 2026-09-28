import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { assertOwnedNavigation, driver } from './browser.mjs';

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
