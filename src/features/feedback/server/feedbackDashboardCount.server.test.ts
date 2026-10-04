import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { countPendingFeedback } from './feedbackProvider.server';

function client(fetchProvider: typeof fetch) {
	return createClient('http://provider.example.test', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch: fetchProvider }
	});
}

describe('Feedback Dashboard count through the real SDK', () => {
	it('retains an exact empty new queue without including reviewed rows', async () => {
		const provider = client(async (input, init) => {
			const url = new URL(String(input));
			if (url.pathname !== '/rest/v1/beta_feedback' || init?.method !== 'HEAD')
				throw new Error('Unexpected provider request');
			return new Response(null, {
				headers: { 'content-range': url.searchParams.get('status') === 'eq.new' ? '*/0' : '*/5' }
			});
		});
		await expect(countPendingFeedback(provider)).resolves.toBe(0);
	});
	it.each([null, '*/-1'])('rejects an unavailable exact count: %j', async (range) => {
		const provider = client(
			async () => new Response(null, { headers: range === null ? {} : { 'content-range': range } })
		);
		await expect(countPendingFeedback(provider)).rejects.toThrow();
	});
	it('propagates provider failures', async () => {
		const provider = client(async () => Response.json({ message: 'Read unavailable' }, { status: 400 }));
		await expect(countPendingFeedback(provider)).rejects.toThrow();
	});
});
