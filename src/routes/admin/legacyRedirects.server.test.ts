import { describe, expect, it } from 'vitest';
import { GET as accessRequests } from './access-requests/+server';
import { GET as feedback } from './feedback/+server';

describe('retired admin routes', () => {
	it.each([
		['access requests', accessRequests, '/admin?kind=accessRequest'],
		['feedback', feedback, '/admin?kind=feedback']
	] as const)('sends %s to its Inbox filter', async (_name, handler, location) => {
		await expect(Promise.resolve().then(() => handler({} as never))).rejects.toMatchObject({ status: 308, location });
	});
});
