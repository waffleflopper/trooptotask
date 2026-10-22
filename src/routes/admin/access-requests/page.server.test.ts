import { beforeEach, describe, expect, it, vi } from 'vitest';

const { operations, createOperations } = vi.hoisted(() => ({
	operations: { approve: vi.fn(), reject: vi.fn(), resendSetup: vi.fn() },
	createOperations: vi.fn()
}));
vi.mock('$features/platform-admin/index.server', () => ({ createPlatformAccessRequestOperations: createOperations }));
import { actions } from './+page.server';

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
function event(requestId: string | null = REQUEST_ID) {
	return {
		request: new Request('https://app.example.test/admin/access-requests', {
			method: 'POST',
			body: new URLSearchParams(requestId === null ? {} : { requestId })
		})
	};
}
const stepUpFailure = {
	error: 'Please confirm your identity before continuing.',
	reason: 'denied.staleSession',
	requiresStepUp: true,
	stepUpPath: '/auth/mfa-verify'
};

describe('Access Request HTTP delivery', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		createOperations.mockResolvedValue(operations);
	});

	for (const [action, command] of [
		['approve', 'approve'],
		['reject', 'reject'],
		['resend', 'resendSetup']
	] as const) {
		it.each([
			{ id: null, message: 'Missing request ID' },
			{ id: '', message: 'Missing request ID' },
			{ id: 'not-a-uuid', message: 'Invalid request ID' }
		])(`${action} rejects invalid request IDs before commands`, async ({ id, message }) => {
			await expect(actions[action](event(id) as never)).resolves.toEqual({ status: 400, data: { error: message } });
			expect(operations[command]).not.toHaveBeenCalled();
		});
		it(`${action} verifies admission before decoding form data`, async () => {
			createOperations.mockRejectedValueOnce({ status: 403 });
			const formData = vi.fn();
			await expect(actions[action]({ request: { formData } } as never)).rejects.toMatchObject({ status: 403 });
			expect(formData).not.toHaveBeenCalled();
			expect(operations[command]).not.toHaveBeenCalled();
		});
		it(`${action} preserves the sensitive-action step-up response`, async () => {
			const { error: message, ...failure } = stepUpFailure;
			operations[command].mockResolvedValueOnce({ status: 'authorization_denied', message, failure });
			await expect(actions[action](event() as never)).resolves.toEqual({ status: 403, data: stepUpFailure });
		});
		it(`${action} reports a safe command failure`, async () => {
			operations[command].mockResolvedValueOnce({ status: 'failed' });
			const error =
				action === 'approve'
					? 'Failed to approve request'
					: action === 'reject'
						? 'Failed to reject request'
						: 'Failed to resend setup email';
			await expect(actions[action](event() as never)).resolves.toEqual({ status: 500, data: { error } });
		});
	}

	it.each(['approve', 'resend'] as const)(
		'keeps %s successful when the approval/setup write completed but email delivery failed',
		async (action) => {
			const command = action === 'approve' ? operations.approve : operations.resendSetup;
			command.mockResolvedValueOnce({ status: 'delivery_failed', setupDeliveryStatus: 'failed' });
			await expect(actions[action](event() as never)).resolves.toEqual({
				success: true,
				action,
				setupDeliveryStatus: 'failed'
			});
		}
	);

	it.each([
		{
			action: 'approve',
			command: 'approve',
			result: { status: 'already_reviewed' },
			status: 404,
			data: { error: 'Request not found or already reviewed' }
		},
		{
			action: 'reject',
			command: 'reject',
			result: { status: 'already_reviewed' },
			status: 404,
			data: { error: 'Request not found or already reviewed' }
		},
		{
			action: 'resend',
			command: 'resendSetup',
			result: { status: 'not_found' },
			status: 404,
			data: { error: 'Approved request not found' }
		},
		{
			action: 'resend',
			command: 'resendSetup',
			result: { status: 'not_approved' },
			status: 404,
			data: { error: 'Approved request not found' }
		},
		{
			action: 'approve',
			command: 'approve',
			result: { status: 'not_approved' },
			status: 400,
			data: { error: 'Access request must be approved before setup can be sent.' }
		},
		{
			action: 'resend',
			command: 'resendSetup',
			result: { status: 'setup_completed' },
			status: 400,
			data: {
				error: 'This user has already completed account setup. They can sign in or use reset password if needed.'
			}
		},
		{
			action: 'approve',
			command: 'approve',
			result: { status: 'concurrent_create' },
			status: 409,
			data: {
				error:
					'Another setup link is being created for this request. Refresh and try again if a fresh link does not appear.'
			}
		},
		{
			action: 'approve',
			command: 'approve',
			result: {
				status: 'rate_limited',
				message: 'Too many setup email attempts. Try again in 60 seconds.',
				retryAfterSeconds: 60
			},
			status: 429,
			data: { error: 'Too many setup email attempts. Try again in 60 seconds.', retryAfterSeconds: 60 }
		}
	] as const)('preserves $action $result.status protections', async ({ action, command, result, status, data }) => {
		operations[command].mockResolvedValueOnce(result);
		await expect(actions[action](event() as never)).resolves.toEqual({ status, data });
	});
});
