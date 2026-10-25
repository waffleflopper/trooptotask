import { beforeEach, describe, expect, it, vi } from 'vitest';
const { people, access, createPeople, createAccess } = vi.hoisted(() => ({
	people: { request: vi.fn(), setupTimeline: vi.fn() },
	access: { resendSetup: vi.fn(), rescind: vi.fn() },
	createPeople: vi.fn(),
	createAccess: vi.fn()
}));
vi.mock('$features/platform-admin/index.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/platform-admin/index.server')>()),
	createPlatformPeopleOperations: createPeople,
	createPlatformAccessRequestOperations: createAccess
}));
import { actions, load } from './+page.server';
const requestId = 'f4a00000-0000-4000-8000-000000000011';
const event = () => ({ params: { requestId } });
beforeEach(() => {
	vi.resetAllMocks();
	createPeople.mockResolvedValue(people);
	createAccess.mockResolvedValue(access);
});
describe('Not set up person', () => {
	it('loads the request while its timeline retains its own load error', async () => {
		people.request.mockResolvedValue({
			id: requestId,
			name: 'Pat',
			status: 'approved',
			setup_completed_at: null,
			setup_grant_live: true
		});
		people.setupTimeline.mockResolvedValue({ status: 'error', message: 'Timeline unavailable' });
		const result = await load(event() as never);
		expect(result).toMatchObject({ request: { id: requestId } });
		if (!result) throw new Error('Expected request detail');
		await expect(result.setupTimeline).resolves.toMatchObject({ status: 'error' });
	});
	it.each([
		{ status: 'rescinded', setup_grant_live: true },
		{ status: 'approved', setup_grant_live: false },
		{ status: 'approved', setup_grant_live: true, setup_completed_at: '2026-10-24' }
	])('does not show an ineligible request as Not set up', async (request) => {
		people.request.mockResolvedValue(request);
		await expect(load(event() as never)).rejects.toMatchObject({ status: 404 });
		expect(people.setupTimeline).not.toHaveBeenCalled();
	});
	it('reports an already-sent setup email separately when required audit fails', async () => {
		access.resendSetup.mockResolvedValue({ status: 'email_sent_audit_failed', setupDeliveryStatus: 'sent' });
		await expect(actions.resendSetup(event() as never)).resolves.toMatchObject({
			status: 500,
			data: { emailSent: true, status: 'email_sent_audit_failed' }
		});
	});
	it('preserves a claim-held denial instead of reporting rescission success', async () => {
		access.rescind.mockResolvedValue({ status: 'claim_held' });
		await expect(actions.rescindAccess(event() as never)).resolves.toMatchObject({
			status: 409,
			data: { status: 'claim_held' }
		});
	});
	it.each(['resendSetup', 'rescindAccess'] as const)('admits %s before any request command', async (command) => {
		createAccess.mockRejectedValue({ status: 403 });
		await expect(actions[command](event() as never)).rejects.toMatchObject({ status: 403 });
		expect(access.resendSetup).not.toHaveBeenCalled();
		expect(access.rescind).not.toHaveBeenCalled();
	});
});
