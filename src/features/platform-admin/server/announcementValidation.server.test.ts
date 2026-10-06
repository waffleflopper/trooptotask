import { describe, it, expect } from 'vitest';
import { validatePlatformAnnouncement } from './announcements.server';

describe('validatePlatformAnnouncement', () => {
	it('accepts valid announcement', () => {
		const result = validatePlatformAnnouncement({
			title: 'Maintenance Window',
			message: 'System will be down Saturday 2-4am EST.',
			type: 'maintenance'
		});
		expect(result).toMatchObject({ valid: true, title: 'Maintenance Window' });
	});

	it('rejects empty title', () => {
		const result = validatePlatformAnnouncement({ title: '', message: 'test', type: 'info' });
		expect(result.valid).toBe(false);
	});

	it('rejects title over 200 chars', () => {
		const result = validatePlatformAnnouncement({ title: 'a'.repeat(201), message: 'test', type: 'info' });
		expect(result.valid).toBe(false);
	});

	it('rejects empty message', () => {
		const result = validatePlatformAnnouncement({ title: 'test', message: '', type: 'info' });
		expect(result.valid).toBe(false);
	});

	it('rejects message over 1000 chars', () => {
		const result = validatePlatformAnnouncement({ title: 'test', message: 'a'.repeat(1001), type: 'info' });
		expect(result.valid).toBe(false);
	});

	it('rejects invalid type', () => {
		const result = validatePlatformAnnouncement({ title: 'test', message: 'test', type: 'error' });
		expect(result.valid).toBe(false);
	});

	it('accepts valid expiry date', () => {
		const future = new Date(Date.now() + 86400000).toISOString();
		const result = validatePlatformAnnouncement({ title: 'test', message: 'test', type: 'info', expiresAt: future });
		expect(result).toMatchObject({ valid: true, expiresAt: future });
	});

	it('allows null expiry', () => {
		const result = validatePlatformAnnouncement({ title: 'test', message: 'test', type: 'info' });
		expect(result).toEqual({
			valid: true,
			title: 'test',
			message: 'test',
			type: 'info'
		});
	});
});
