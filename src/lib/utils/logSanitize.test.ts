import { describe, expect, it } from 'vitest';
import { sanitizeErrorForLog } from './logSanitize';

describe('sanitizeErrorForLog', () => {
	it('masks emails in Error messages while keeping the error name', () => {
		const err = new Error('Failed for jane.doe@example.com');
		err.name = 'RouteProcessingError';

		const sanitized = sanitizeErrorForLog(err);

		expect(sanitized).toContain('name=RouteProcessingError');
		expect(sanitized).toContain('[email]');
		expect(sanitized).not.toContain('jane.doe@example.com');
	});

	it('masks long digit runs in Error messages', () => {
		const sanitized = sanitizeErrorForLog(new Error('Failed for phone 5551234567'));

		expect(sanitized).toContain('[number]');
		expect(sanitized).not.toContain('5551234567');
	});

	it('masks formatted phone numbers in Error messages', () => {
		const sanitized = sanitizeErrorForLog(new Error('Failed for phone 555-123-4567 and (907) 555-0101'));

		expect(sanitized).toContain('[number]');
		expect(sanitized).not.toContain('555-123-4567');
		expect(sanitized).not.toContain('(907) 555-0101');
	});

	it('masks formatted ID numbers in Supabase diagnostics', () => {
		const sanitized = sanitizeErrorForLog({
			message: 'duplicate key',
			details: 'Key (ssn)=(123-45-6789) already exists.'
		});

		expect(sanitized).toContain('details=Key (ssn)=([number]) already exists.');
		expect(sanitized).not.toContain('123-45-6789');
	});

	it('extracts Supabase-shaped diagnostics and masks emails', () => {
		const sanitized = sanitizeErrorForLog({
			message: 'duplicate key',
			code: '23505',
			details: 'Key (email)=(jane.doe@example.com) already exists.'
		});

		expect(sanitized).toContain('message=duplicate key');
		expect(sanitized).toContain('code=23505');
		expect(sanitized).toContain('details=Key (email)=([email]) already exists.');
		expect(sanitized).not.toContain('jane.doe@example.com');
	});

	it('ignores nested payload fields that are not allowlisted', () => {
		const sanitized = sanitizeErrorForLog({
			message: 'failed',
			record: { firstName: 'Jane', phone: '5551234567' }
		});

		expect(sanitized).toContain('message=failed');
		expect(sanitized).not.toContain('Jane');
		expect(sanitized).not.toContain('5551234567');
	});

	it('handles string and null inputs without throwing', () => {
		expect(() => sanitizeErrorForLog('plain failure')).not.toThrow();
		expect(() => sanitizeErrorForLog(null)).not.toThrow();
		expect(typeof sanitizeErrorForLog('plain failure')).toBe('string');
		expect(typeof sanitizeErrorForLog(null)).toBe('string');
	});

	it('bounds long messages with a truncation marker', () => {
		const sanitized = sanitizeErrorForLog(new Error('x'.repeat(1200)));

		expect(sanitized.length).toBeLessThanOrEqual(1000);
		expect(sanitized).toContain('[truncated]');
		expect(sanitized.endsWith('… [truncated]')).toBe(true);
	});
});
