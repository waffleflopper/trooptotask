import { describe, it, expect } from 'vitest';
import type {
	UseCaseContext,
	WritePorts,
	WriteWithNotificationsPorts,
	WriteWithSubscriptionPorts,
	UserWritePorts,
	QueryPorts,
	QueryWithRawStorePorts
} from './ports';

describe('Port bundle types', () => {
	it('UseCaseContext structurally satisfies all 6 port bundles', () => {
		// This test is compile-time: if it compiles, UseCaseContext satisfies all bundles.
		// The runtime assertion is just a formality.
		function acceptsWritePorts(_ctx: WritePorts) {}
		function acceptsWriteWithNotifications(_ctx: WriteWithNotificationsPorts) {}
		function acceptsWriteWithSubscription(_ctx: WriteWithSubscriptionPorts) {}
		function acceptsUserWritePorts(_ctx: UserWritePorts) {}
		function acceptsQueryPorts(_ctx: QueryPorts) {}
		function acceptsQueryWithRawStore(_ctx: QueryWithRawStorePorts) {}

		// If this compiles, UseCaseContext satisfies all bundles
		const ctx = {} as UseCaseContext;
		acceptsWritePorts(ctx);
		acceptsWriteWithNotifications(ctx);
		acceptsWriteWithSubscription(ctx);
		acceptsUserWritePorts(ctx);
		acceptsQueryPorts(ctx);
		acceptsQueryWithRawStore(ctx);

		expect(true).toBe(true);
	});
});
