import { describe, expect, it } from 'vitest';
import { classifyFailure, normalizeFailureMessage, sanitizeFailureForCapture } from './failureCapture';

describe('sanitizeFailureForCapture', () => {
	it('drops a quoted value the length limit cuts before its closing quote', () => {
		const { message } = sanitizeFailureForCapture({ message: `Save failed "token=secret ${'x'.repeat(3000)}"` });
		expect(message).toBe('Save failed');
	});

	it('bounds the message it stores however long the failure is', () => {
		const { message } = sanitizeFailureForCapture({ message: 'word '.repeat(20_000) });
		expect(message).toBe('word '.repeat(60));
	});

	it('masks a long unquoted token such as a JWT', () => {
		expect(normalizeFailureMessage('Invalid JWT eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnop')).toBe('Invalid JWT [token]');
	});

	it('still reads a UUID as an id rather than a token', () => {
		expect(normalizeFailureMessage('No row for 8a1f0c2e-1111-4222-8333-444455556666')).toBe('No row for [id]');
	});

	it.each([
		['Request failed: https://service.test/export?token=secret', 'Request failed: [url]'],
		['Could not load /org/alpha/personnel/Jane-Smith now', 'Could not load [url] now'],
		['Could not save Jane Smith', 'Could not save [name]'],
		['Could not save SMITH, JOHN', 'Could not save [name]']
	])('removes values from %s', (message, expected) => {
		expect(sanitizeFailureForCapture({ message }).message).toBe(expected);
	});

	it('drops Postgres row values from message and ignores details, hint and stack', () => {
		const failure = Object.assign(
			new Error(
				'new row for relation "personnel" violates check constraint "x_check" Failing row contains (3f2b8c1e-aaaa-4bbb-8ccc-123456789abc, Jane Q Smith)'
			),
			{
				code: '23514',
				details: 'Failing row contains (Jane Q Smith, 123-45-6789)',
				hint: 'Jane Q Smith',
				secret: 'Jane Q Smith'
			}
		);
		expect(sanitizeFailureForCapture(failure)).toEqual({
			name: 'Error',
			code: '23514',
			message: 'new row for relation ? violates check constraint ?'
		});
	});

	it('cuts at DETAIL and masks quoted strings, ids, emails and digit runs', () => {
		const failure = {
			name: 'PostgrestError',
			code: 'PGRST301',
			message:
				'Key (name)=(Jane Smith) failed for jane.smith@example.test in 8a1f0c2e-1111-4222-8333-444455556666 after 42 tries DETAIL: Key (name)=(Jane Smith)'
		};
		expect(sanitizeFailureForCapture(failure)).toEqual({
			name: 'PostgrestError',
			code: 'PGRST301',
			message: 'Key ? failed for [email] in [id] after [n] tries'
		});
	});

	it('quotes hide a name inside the message', () => {
		expect(sanitizeFailureForCapture({ message: 'Could not find person "Jane Smith" in \'Alpha Company\'' })).toEqual({
			name: 'Error',
			code: null,
			message: 'Could not find person ? in ?'
		});
	});

	it('truncates to 300 characters and rejects unusual names and codes', () => {
		const result = sanitizeFailureForCapture({ name: 'Jane Smith', code: 'has space', message: 'word '.repeat(100) });
		expect(result.name).toBe('Error');
		expect(result.code).toBeNull();
		expect(result.message).toHaveLength(300);
	});

	it('gives the same message for two occurrences that differ only in values', () => {
		const first = sanitizeFailureForCapture({ message: 'Row 17 for 8a1f0c2e-1111-4222-8333-444455556666 failed' });
		const second = sanitizeFailureForCapture({ message: 'Row 42 for 0b2e1d3f-9999-4888-8777-666655554444 failed' });
		expect(first.message).toBe(second.message);
	});

	it('survives non-error values', () => {
		expect(sanitizeFailureForCapture(null)).toEqual({ name: 'Error', code: null, message: '' });
		expect(sanitizeFailureForCapture('Jane Smith')).toEqual({ name: 'Error', code: null, message: '' });
	});
});

describe('classifyFailure', () => {
	it.each([
		[{ source: 'server', status: 500, unknownException: false }, 'server_response'],
		[{ source: 'server', status: 503, unknownException: false }, 'server_response'],
		[{ source: 'server', status: 500, unknownException: true }, 'server_exception'],
		[{ source: 'server', status: 400, unknownException: false }, null],
		[{ source: 'server', status: 403, unknownException: false }, null],
		[{ source: 'server', status: 404, unknownException: false }, null],
		[{ source: 'server', status: 409, unknownException: false }, null],
		[{ source: 'server', status: 429, unknownException: false }, null],
		[{ source: 'server', status: 200, unknownException: false }, null],
		[{ source: 'client-navigation', caught: 'unknown', status: 500 }, 'render'],
		[{ source: 'client-navigation', caught: 'framework', status: 404 }, null],
		[{ source: 'client-navigation', caught: 'app', status: 422 }, null],
		[{ source: 'client-navigation', caught: 'app', status: 502 }, 'server_exception'],
		[{ source: 'fetch-rejection', method: 'GET' }, 'transport'],
		[{ source: 'fetch-rejection', method: 'HEAD' }, 'transport'],
		[{ source: 'fetch-rejection', method: 'POST' }, 'unconfirmed_write'],
		[{ source: 'fetch-rejection', method: 'DELETE' }, 'unconfirmed_write'],
		[{ source: 'window-error' }, 'render']
	] as const)('%j is %s', (input, expected) => {
		expect(classifyFailure(input)).toBe(expected);
	});
});
