import { beforeEach, describe, expect, it, vi } from 'vitest';

const { accountOperations, createOperations } = vi.hoisted(() => ({
	accountOperations: {
		adminUserId: '22222222-2222-4222-8222-222222222222',
		getUserDetail: vi.fn(),
		sendPasswordReset: vi.fn(),
		resendInvite: vi.fn()
	},
	createOperations: vi.fn()
}));
vi.mock('$features/platform-admin/index.server', () => ({ createPlatformAccountOperations: createOperations }));

import { actions, load } from './+page.server';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const detail = {
	user: { id: USER_ID, email: 'soldier@example.test', emailConfirmationStatus: 'confirmed' },
	organizations: [{ id: 'org-a', name: 'Able Clinic', role: 'member', personnelCount: 3 }],
	suspension: null,
	isSuspended: false,
	recentActivity: [{ id: 'audit-a', action: 'view_personnel', severity: 'info' }]
};
function event(userId = USER_ID) {
	return { params: { userId }, url: new URL(`/admin/users/${userId}`, 'https://app.example.test') };
}

describe('User detail HTTP delivery', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		createOperations.mockResolvedValue(accountOperations);
		accountOperations.getUserDetail.mockResolvedValue({ status: 'found', detail });
	});

	it('returns the safe detail including activity and that another User may be suspended', async () => {
		const request = event();
		await expect(load(request as never)).resolves.toEqual({
			...detail,
			isSelf: false,
			canSuspend: true,
			suspendDisabledReason: null
		});
		expect(createOperations).toHaveBeenCalledWith(request);
		expect(accountOperations.getUserDetail).toHaveBeenCalledWith(USER_ID);
	});

	it("disables Suspend with a reason on the operator's own account", async () => {
		const own = detail.user.id;
		createOperations.mockResolvedValue({ ...accountOperations, adminUserId: own.toUpperCase() });
		await expect(load(event(own) as never)).resolves.toMatchObject({
			isSelf: true,
			canSuspend: false,
			suspendDisabledReason: 'You cannot suspend your own account.'
		});
	});

	it.each([
		{ result: { status: 'not_found' }, status: 404, message: 'User not found' },
		{
			result: { status: 'auth_error', message: 'private provider detail' },
			status: 500,
			message: 'Failed to load user identity'
		}
	])('maps $result.status to a safe detail response', async ({ result, status, message }) => {
		accountOperations.getUserDetail.mockResolvedValueOnce(result);
		await expect(load(event() as never)).rejects.toMatchObject({ status, body: { message } });
	});

	it('rejects malformed IDs before reading detail or issuing email commands', async () => {
		await expect(load(event('invalid') as never)).rejects.toMatchObject({ status: 400 });
		for (const action of [actions.resetPassword, actions.resendInvite])
			await expect(action(event('invalid') as never)).resolves.toEqual({
				status: 400,
				data: { error: 'Invalid user ID' }
			});
		expect(accountOperations.getUserDetail).not.toHaveBeenCalled();
		expect(accountOperations.sendPasswordReset).not.toHaveBeenCalled();
		expect(accountOperations.resendInvite).not.toHaveBeenCalled();
	});

	it.each(['load', 'resetPassword', 'resendInvite'] as const)(
		'admits the request before %s reads route parameters',
		async (handler) => {
			createOperations.mockRejectedValueOnce({ status: 403 });
			const paramsRead = vi.fn(() => ({ userId: 'invalid' }));
			const request = {
				get params() {
					return paramsRead();
				}
			};
			const run = handler === 'load' ? load : actions[handler];
			await expect(run(request as never)).rejects.toMatchObject({ status: 403 });
			expect(paramsRead).not.toHaveBeenCalled();
		}
	);

	for (const [action, command, error] of [
		['resetPassword', 'sendPasswordReset', 'Failed to send password reset'],
		['resendInvite', 'resendInvite', 'Failed to resend invite']
	] as const) {
		it(`${action} maps missing targets to 404`, async () => {
			accountOperations[command].mockResolvedValueOnce({ status: 'not_found' });
			await expect(actions[action](event() as never)).resolves.toEqual({
				status: 404,
				data: { error: 'User not found' }
			});
		});
		it(`${action} keeps provider errors safe`, async () => {
			accountOperations[command].mockResolvedValueOnce({
				status: 'provider_error',
				message: 'private provider detail'
			});
			await expect(actions[action](event() as never)).resolves.toEqual({ status: 500, data: { error } });
		});
		it(`${action} maps the existing per-target email limiter to 429`, async () => {
			const message =
				action === 'resetPassword'
					? 'Too many password reset emails. Please try again later.'
					: 'Too many invite emails. Please try again later.';
			accountOperations[command].mockResolvedValueOnce({ status: 'rate_limited', message });
			await expect(actions[action](event() as never)).resolves.toEqual({ status: 429, data: { error: message } });
		});
	}
});
