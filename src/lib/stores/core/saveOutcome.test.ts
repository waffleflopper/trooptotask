import { describe, expect, it } from 'vitest';
import type { ActionResult } from '$app/forms';
import { StoreRequestError } from './ports';
import { classifyWrite } from './saveOutcome';

describe('classifyWrite', () => {
	it.each([
		{ reply: 200, outcome: 'saved' },
		{ reply: 204, outcome: 'saved' },
		{ reply: 303, outcome: 'saved' },
		{ reply: 400, outcome: 'not-saved' },
		{ reply: 404, outcome: 'not-saved' },
		{ reply: 409, outcome: 'not-saved' },
		{ reply: 499, outcome: 'not-saved' },
		{ reply: 500, outcome: 'unconfirmed' },
		{ reply: 503, outcome: 'unconfirmed' },
		{ reply: new Response(null, { status: 204 }), outcome: 'saved' },
		{ reply: new StoreRequestError('Invalid input', 422), outcome: 'not-saved' },
		{ reply: new StoreRequestError('Lost upstream reply', 502), outcome: 'unconfirmed' },
		{ reply: new TypeError('Failed to fetch'), outcome: 'unconfirmed' },
		{ reply: null, outcome: 'unconfirmed' },
		{ reply: undefined, outcome: 'unconfirmed' },
		{ reply: '200', outcome: 'unconfirmed' },
		{ reply: 200.5, outcome: 'unconfirmed' },
		{ reply: { status: 200.5 }, outcome: 'unconfirmed' }
	])('classifies $reply as $outcome', ({ reply, outcome }) => {
		expect(classifyWrite(reply)).toBe(outcome);
	});

	it.each([
		{ reply: { type: 'success', status: 200, data: {}, location: '/save' }, outcome: 'saved' },
		{ reply: { type: 'failure', status: 400, data: {}, location: '/save' }, outcome: 'not-saved' },
		{ reply: { type: 'failure', status: 500, data: {}, location: '/save' }, outcome: 'unconfirmed' },
		{ reply: { type: 'redirect', status: 303, location: '/next' }, outcome: 'saved' },
		{ reply: { type: 'error', status: 500, error: { message: 'Server failed', status: 500 } }, outcome: 'unconfirmed' },
		{ reply: { type: 'error', status: 403, error: { message: 'Refused', status: 403 } }, outcome: 'not-saved' },
		{ reply: { type: 'error', error: { message: 'No reply status', status: 500 } }, outcome: 'unconfirmed' }
	] satisfies { reply: ActionResult; outcome: string }[])(
		'classifies a $reply.type action as $outcome',
		({ reply, outcome }) => {
			expect(classifyWrite(reply)).toBe(outcome);
		}
	);
});
