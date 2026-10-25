import { beforeEach, describe, expect, it, vi } from 'vitest';

const { accessRequests, inbox, createAccessRequests, createInbox } = vi.hoisted(() => ({
	accessRequests: { approve: vi.fn(), reject: vi.fn() },
	inbox: { queue: vi.fn(), stats: vi.fn(), closeFeedback: vi.fn() },
	createAccessRequests: vi.fn(),
	createInbox: vi.fn()
}));
vi.mock('$features/platform-admin/index.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/platform-admin/index.server')>()),
	createPlatformAccessRequestOperations: createAccessRequests,
	createPlatformInboxOperations: createInbox
}));
import { actions, load } from './+page.server';

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
function event(form: Record<string, string> | null = { id: ITEM_ID }, search = '') {
	return {
		url: new URL(`https://app.example.test/admin${search}`),
		depends: vi.fn(),
		request: new Request('https://app.example.test/admin', {
			method: 'POST',
			body: new URLSearchParams(form ?? {})
		})
	};
}
const stepUpFailure = {
	error: 'Please confirm your identity before continuing.',
	reason: 'denied.staleSession',
	requiresStepUp: true,
	stepUpPath: '/auth/mfa-verify'
};

beforeEach(() => {
	vi.resetAllMocks();
	createAccessRequests.mockResolvedValue(accessRequests);
	createInbox.mockResolvedValue(inbox);
});

describe('Inbox load', () => {
	it.each([
		['', 'open'],
		['?tab=done', 'done'],
		['?tab=elsewhere', 'open']
	] as const)('reads the %s tab as %s', async (search, tab) => {
		inbox.queue.mockReturnValue('queue');
		inbox.stats.mockReturnValue('stats');

		await expect(load(event(null, search) as never)).resolves.toEqual({ tab, sources: 'queue', stats: 'stats' });
		expect(inbox.queue).toHaveBeenCalledWith(tab);
	});
});

describe('Inbox commands', () => {
	for (const action of ['approve', 'reject', 'close'] as const) {
		it.each([
			{ id: null, message: 'Missing item ID' },
			{ id: '', message: 'Missing item ID' },
			{ id: 'not-a-uuid', message: 'Invalid item ID' }
		])(`${action} rejects item ID $id before any command`, async ({ id, message }) => {
			const form: Record<string, string> = id === null ? {} : { id };
			await expect(actions[action](event(form) as never)).resolves.toEqual({ status: 400, data: { error: message } });
			expect(accessRequests.approve).not.toHaveBeenCalled();
			expect(accessRequests.reject).not.toHaveBeenCalled();
			expect(inbox.closeFeedback).not.toHaveBeenCalled();
		});

		it(`${action} verifies admission before reading the form`, async () => {
			(action === 'close' ? createInbox : createAccessRequests).mockRejectedValueOnce({ status: 403 });
			const formData = vi.fn();
			await expect(actions[action]({ request: { formData } } as never)).rejects.toMatchObject({ status: 403 });
			expect(formData).not.toHaveBeenCalled();
		});
	}

	it.each(['approve', 'reject'] as const)('%s preserves the sensitive-action step-up response', async (action) => {
		const { error: message, ...failure } = stepUpFailure;
		accessRequests[action].mockResolvedValueOnce({ status: 'authorization_denied', message, failure });

		await expect(actions[action](event() as never)).resolves.toEqual({ status: 403, data: stepUpFailure });
	});

	it('approve stays successful when the approval was recorded but the email failed', async () => {
		accessRequests.approve.mockResolvedValueOnce({ status: 'delivery_failed', setupDeliveryStatus: 'failed' });

		await expect(actions.approve(event() as never)).resolves.toEqual({
			success: true,
			action: 'approve',
			setupDeliveryStatus: 'failed'
		});
	});

	it('approve tells the operator to reload when it cannot confirm the outcome', async () => {
		accessRequests.approve.mockResolvedValueOnce({ status: 'failed' });

		const result = await actions.approve(event() as never);

		expect(result).toMatchObject({ status: 500, data: { error: expect.stringContaining('Reload') } });
	});

	it('reject passes a trimmed reason, and none when it is blank', async () => {
		accessRequests.reject.mockResolvedValue({ status: 'rejected' });

		await expect(actions.reject(event({ id: ITEM_ID, reason: '  Not a unit account ' }) as never)).resolves.toEqual({
			success: true,
			action: 'reject'
		});
		await actions.reject(event({ id: ITEM_ID, reason: '   ' }) as never);

		expect(accessRequests.reject.mock.calls).toEqual([
			[ITEM_ID, 'Not a unit account'],
			[ITEM_ID, null]
		]);
	});

	it('reject refuses a reason over 500 characters without rejecting', async () => {
		const result = await actions.reject(event({ id: ITEM_ID, reason: 'x'.repeat(501) }) as never);

		expect(result).toMatchObject({ status: 400 });
		expect(accessRequests.reject).not.toHaveBeenCalled();
	});

	it('reports a request someone else already decided as gone, not as a failure', async () => {
		accessRequests.reject.mockResolvedValueOnce({ status: 'already_reviewed' });

		await expect(actions.reject(event() as never)).resolves.toMatchObject({ status: 404 });
	});

	it('closes feedback and reports success', async () => {
		inbox.closeFeedback.mockResolvedValueOnce('closed');

		await expect(actions.close(event() as never)).resolves.toEqual({ success: true, action: 'close' });
		expect(inbox.closeFeedback).toHaveBeenCalledWith(ITEM_ID);
	});

	it('reports feedback that is already closed as gone', async () => {
		inbox.closeFeedback.mockResolvedValueOnce('not_open');

		await expect(actions.close(event() as never)).resolves.toMatchObject({ status: 404 });
	});

	it('fails the close when its audit write fails, telling the operator to reload', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		inbox.closeFeedback.mockRejectedValueOnce(new Error('Audit log write failed'));

		const result = await actions.close(event() as never);

		expect(result).toMatchObject({ status: 500, data: { error: expect.stringContaining('Reload') } });
	});
});
