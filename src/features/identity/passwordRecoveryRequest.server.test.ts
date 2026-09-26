import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPublicPasswordRecovery } from './passwordRecoveryRequest.server';

const input = {
	email: 'Soldier@Example.mil',
	clientAddress: vi.fn(() => '203.0.113.10'),
	origin: 'http://localhost:4173',
	userAgent: 'vitest-agent'
};

const deps = {
	checkRateLimit: vi.fn(),
	sendEmail: vi.fn(),
	audit: vi.fn()
};

beforeEach(() => {
	vi.clearAllMocks();
	deps.checkRateLimit.mockResolvedValue({
		limited: false,
		namespace: 'forgot-password',
		dimensions: ['email', 'ip'],
		limitedDimensions: [],
		windowMs: 3_600_000,
		maxRequests: 3
	});
	deps.sendEmail.mockResolvedValue('sent');
	deps.audit.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('public password recovery request', () => {
	it('rejects invalid input before consuming a limit or generating a link', async () => {
		await expect(requestPublicPasswordRecovery({ ...input, email: '  invalid  ' }, deps)).resolves.toEqual({
			status: 'invalid-email',
			email: 'invalid'
		});
		expect(deps.checkRateLimit).not.toHaveBeenCalled();
		expect(deps.sendEmail).not.toHaveBeenCalled();
		expect(input.clientAddress).not.toHaveBeenCalled();
	});

	it('denies a limited request, audits only redacted decision details and sends no link', async () => {
		deps.checkRateLimit.mockResolvedValueOnce({
			limited: true,
			namespace: 'forgot-password',
			dimensions: ['email', 'ip'],
			limitedDimensions: ['email'],
			windowMs: 3_600_000,
			maxRequests: 3,
			retryAfterMs: 120_000
		});
		await expect(requestPublicPasswordRecovery(input, deps)).resolves.toEqual({
			status: 'rate-limited',
			email: input.email
		});
		expect(deps.sendEmail).not.toHaveBeenCalled();
		expect(deps.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'auth.forgot_password_rate_limited',
				details: expect.objectContaining({ limitedDimensions: ['email'], retryAfterMs: 120_000 })
			}),
			expect.objectContaining({ ip: '203.0.113.10', userAgent: input.userAgent })
		);
		expect(JSON.stringify(deps.audit.mock.calls[0][0].details)).not.toMatch(/Soldier@Example\.mil|203\.0\.113\.10/);
	});

	it('uses the configured public origin for the recovery confirmation link', async () => {
		vi.stubEnv('APP_PUBLIC_ORIGIN', 'https://trooptotask.org');
		await expect(
			requestPublicPasswordRecovery({ ...input, origin: 'https://untrusted.example' }, deps)
		).resolves.toEqual({ status: 'accepted', email: input.email });
		expect(deps.sendEmail).toHaveBeenCalledWith(
			input.email,
			'https://trooptotask.org/auth/confirm?type=recovery&next=%2Fauth%2Freset-password'
		);
	});

	it.each(['user_not_found', 'failed'])('keeps the public result quiet for %s delivery', async (delivery) => {
		deps.sendEmail.mockResolvedValueOnce(delivery);
		await expect(requestPublicPasswordRecovery(input, deps)).resolves.toEqual({
			status: 'accepted',
			email: input.email
		});
	});

	it('keeps the public result quiet when the delivery adapter throws', async () => {
		deps.sendEmail.mockRejectedValueOnce(new Error('synthetic provider failure'));
		await expect(requestPublicPasswordRecovery(input, deps)).resolves.toEqual({
			status: 'accepted',
			email: input.email
		});
	});

	it('fails closed if the durable limit is unavailable', async () => {
		deps.checkRateLimit.mockRejectedValueOnce(new Error('synthetic limit failure'));
		await expect(requestPublicPasswordRecovery(input, deps)).rejects.toThrow('synthetic limit failure');
		expect(deps.sendEmail).not.toHaveBeenCalled();
	});
});
