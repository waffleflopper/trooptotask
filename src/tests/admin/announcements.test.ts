import { describe, it, expect } from 'vitest';
import { validateAnnouncement } from '$lib/server/admin';

describe('validateAnnouncement', () => {
	it('accepts valid announcement', () => {
		const result = validateAnnouncement({
			title: 'Maintenance Window',
			message: 'System will be down Saturday 2-4am EST.',
			type: 'maintenance'
		});
		expect(result.valid).toBe(true);
		expect(result.title).toBe('Maintenance Window');
	});

	it('rejects empty title', () => {
		const result = validateAnnouncement({ title: '', message: 'test', type: 'info' });
		expect(result.valid).toBe(false);
	});

	it('rejects title over 200 chars', () => {
		const result = validateAnnouncement({ title: 'a'.repeat(201), message: 'test', type: 'info' });
		expect(result.valid).toBe(false);
	});

	it('rejects empty message', () => {
		const result = validateAnnouncement({ title: 'test', message: '', type: 'info' });
		expect(result.valid).toBe(false);
	});

	it('rejects message over 1000 chars', () => {
		const result = validateAnnouncement({ title: 'test', message: 'a'.repeat(1001), type: 'info' });
		expect(result.valid).toBe(false);
	});

	it('rejects invalid type', () => {
		const result = validateAnnouncement({ title: 'test', message: 'test', type: 'error' });
		expect(result.valid).toBe(false);
	});

	it('accepts valid expiry date', () => {
		const future = new Date(Date.now() + 86400000).toISOString();
		const result = validateAnnouncement({ title: 'test', message: 'test', type: 'info', expiresAt: future });
		expect(result.valid).toBe(true);
		expect(result.expiresAt).toBe(future);
	});

	it('allows null expiry', () => {
		const result = validateAnnouncement({ title: 'test', message: 'test', type: 'info' });
		expect(result.valid).toBe(true);
		expect(result.expiresAt).toBeUndefined();
	});
});
