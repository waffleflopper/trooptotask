import { expect, it, vi } from 'vitest';
import type { RequestHandler } from '@sveltejs/kit';
import { POST as enroll } from './enroll/+server';
import { POST as verifyEnrollment } from './enroll/verify/+server';
import { POST as cancelEnrollment } from './enroll/cancel/+server';
import { POST as disable } from './disable/+server';

it.each([
	['enroll', enroll],
	['enroll/verify', verifyEnrollment],
	['enroll/cancel', cancelEnrollment],
	['disable', disable]
] as const)(
	'rejects %s before provider effects when a provider user lacks complete admission',
	async (path, handler) => {
		const mfa = {
			enroll: vi.fn(),
			listFactors: vi.fn(),
			challengeAndVerify: vi.fn(),
			unenroll: vi.fn()
		};
		// These routes share the same request fixture; their generated route-ID
		// literals do not affect the admission behavior under test.
		const response = await (handler as RequestHandler)({
			request: new Request(`http://app.invalid/api/auth/mfa/${path}`, {
				method: 'POST',
				body: JSON.stringify({ factorId: 'pending-factor', code: '123456' })
			}),
			locals: { actor: null, user: { id: 'provider-user' }, supabase: { auth: { mfa } } }
		} as unknown as Parameters<RequestHandler>[0]);
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: expect.any(String) });
		for (const operation of Object.values(mfa)) expect(operation).not.toHaveBeenCalled();
	}
);
