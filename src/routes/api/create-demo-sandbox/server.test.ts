import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('POST /api/create-demo-sandbox', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('rejects standalone sandbox bootstrap requests', async () => {
		const { POST } = await import('./+server');
		const response = await POST({} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({
			message: 'Demo sandbox creation is no longer available.'
		});
	});

	it('still rejects requests even when a forged demo cookie is present', async () => {
		const { POST } = await import('./+server');
		const response = await POST({
			cookies: {
				get: vi.fn((name: string) => (name === 'demo_mode' ? 'readonly' : undefined))
			}
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({
			message: 'Demo sandbox creation is no longer available.'
		});
	});
});
