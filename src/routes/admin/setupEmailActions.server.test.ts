import { beforeEach, expect, it, vi } from 'vitest';
const { createSetup, createAccess, setup, access } = vi.hoisted(() => ({
	createSetup: vi.fn(),
	createAccess: vi.fn(),
	setup: { askInviter: vi.fn(), resolveLink: vi.fn() },
	access: { resendSetup: vi.fn() }
}));
vi.mock('$features/platform-admin/index.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/platform-admin/index.server')>()),
	createPlatformSetupEmailOperations: createSetup,
	createPlatformAccessRequestOperations: createAccess
}));
import { actions } from './+page.server';
const linkId = 'f4a00000-0000-4000-8000-000000000021';
function event() {
	return {
		request: new Request('https://app.example.test/admin', {
			method: 'POST',
			body: new URLSearchParams({ id: linkId, accessRequestId: 'forged', actorUserId: 'forged' })
		})
	};
}
beforeEach(() => {
	vi.resetAllMocks();
	createSetup.mockResolvedValue(setup);
	createAccess.mockResolvedValue(access);
});
it('tells the operator the inviter was already notified when its required audit failed', async () => {
	setup.askInviter.mockResolvedValue({ status: 'notified_audit_failed' });
	await expect(actions.askInviter(event() as never)).resolves.toMatchObject({
		status: 500,
		data: { status: 'notified_audit_failed', notificationSent: true }
	});
});
it('resolves the setup-link identity on the server instead of accepting a caller request ID', async () => {
	setup.resolveLink.mockResolvedValue('stored-request');
	access.resendSetup.mockResolvedValue({ status: 'sent' });
	await expect(actions.resendSetup(event() as never)).resolves.toMatchObject({ success: true });
	expect(access.resendSetup).toHaveBeenCalledWith('stored-request');
});
it('admits the operator before asking the inviter or reading the item form', async () => {
	createSetup.mockRejectedValue({ status: 403 });
	const readRequest = vi.fn();
	await expect(
		actions.askInviter({
			get request() {
				return readRequest();
			}
		} as never)
	).rejects.toMatchObject({ status: 403 });
	expect(readRequest).not.toHaveBeenCalled();
	expect(setup.askInviter).not.toHaveBeenCalled();
});
