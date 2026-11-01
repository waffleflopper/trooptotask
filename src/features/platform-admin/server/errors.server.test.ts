import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ErrorGroup } from '$features/error-reporting/contracts';
import { createPlatformErrors } from './errors.server';

afterEach(() => vi.restoreAllMocks());

const GROUP_ID = '33333333-3333-4333-8333-333333333333';

function group(overrides: Partial<ErrorGroup> = {}): ErrorGroup {
	return {
		id: GROUP_ID,
		origin: 'server',
		kind: 'server_response',
		name: 'HttpError',
		code: '500',
		message: 'Internal server error',
		routeId: '/org/[orgId]/api/availability',
		method: 'POST',
		status: 'open',
		firstSeenAt: '2026-11-01T10:00:00.000Z',
		lastSeenAt: '2026-11-01T11:00:00.000Z',
		resolvedAt: null,
		occurrenceCount: 3,
		affectedUsers: 2,
		reports: [],
		...overrides
	};
}

function setup({
	list = async () => ({ groups: [group()], total: 1 }),
	resolve = async () => ({ status: 'resolved' as const }),
	audit = async () => {}
}: {
	list?: (input: { status: string; limit: number; offset: number }) => Promise<{ groups: ErrorGroup[]; total: number }>;
	resolve?: (input: {
		groupId: string;
		actorUserId: string;
	}) => Promise<{ status: 'resolved' } | { status: 'not_open' }>;
	audit?: (event: unknown) => Promise<void>;
} = {}) {
	const reader = { list: vi.fn(list) };
	const resolver = { resolve: vi.fn(resolve) };
	const auditEvents = vi.fn(audit);
	const errors = createPlatformErrors({
		reader: reader as never,
		resolver: resolver as never,
		actorUserId: 'operator-1',
		audit: auditEvents
	});
	return { errors, reader, resolver, auditEvents };
}

describe('platform errors', () => {
	it('lists a page of groups for a status, 25 to a page', async () => {
		const { errors, reader } = setup();

		await expect(errors.list({ status: 'open', page: 3 })).resolves.toEqual({
			status: 'ok',
			data: { groups: [group()], total: 1 }
		});
		expect(reader.list).toHaveBeenCalledWith({ status: 'open', limit: 25, offset: 50 });
	});

	it('settles a failed read to its own error instead of rejecting', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { errors } = setup({
			list: async () => {
				throw new Error('database down');
			}
		});

		await expect(errors.list({ status: 'open', page: 1 })).resolves.toEqual({
			status: 'error',
			message: 'Unable to load Errors'
		});
	});

	it('resolves a group as the admitted operator and audits it before answering', async () => {
		const order: string[] = [];
		const { errors, resolver, auditEvents } = setup({
			resolve: async () => {
				order.push('resolved');
				return { status: 'resolved' };
			},
			audit: async () => {
				order.push('audited');
			}
		});

		await expect(errors.resolve(GROUP_ID)).resolves.toEqual({ status: 'resolved' });

		expect(resolver.resolve).toHaveBeenCalledWith({ groupId: GROUP_ID, actorUserId: 'operator-1' });
		expect(auditEvents).toHaveBeenCalledWith({
			action: 'error_group.resolved',
			resourceType: 'platform_error_group',
			resourceId: GROUP_ID,
			severity: 'info'
		});
		expect(order).toEqual(['resolved', 'audited']);
	});

	it('does not audit a group that was not open', async () => {
		const { errors, auditEvents } = setup({ resolve: async () => ({ status: 'not_open' }) });

		await expect(errors.resolve(GROUP_ID)).resolves.toEqual({ status: 'not_open' });
		expect(auditEvents).not.toHaveBeenCalled();
	});

	it('fails the resolve when its required audit cannot be written', async () => {
		const { errors } = setup({
			audit: async () => {
				throw new Error('audit unavailable');
			}
		});

		await expect(errors.resolve(GROUP_ID)).rejects.toThrow('audit unavailable');
	});
});
