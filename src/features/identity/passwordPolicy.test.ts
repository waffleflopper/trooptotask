import { describe, expect, it } from 'vitest';
import { mapProviderPasswordError, passwordRequirements, validatePassword } from './passwordPolicy';

describe('password policy', () => {
	it('accepts the 72-character boundary and rejects a longer password', () => {
		const accepted = `Aa1${'x'.repeat(69)}`;
		const tooLong = `${accepted}x`;
		expect(passwordRequirements(accepted).valid).toBe(true);
		expect(validatePassword(accepted)).toBeNull();
		expect(passwordRequirements(tooLong)).toMatchObject({ maxLength: false, valid: false });
		expect(validatePassword(tooLong)).toBe('Password must be 72 characters or fewer');
	});

	it('rejects missing length and character classes with stable messages', () => {
		expect(validatePassword('Short1Aa')).toBe('Password must be at least 12 characters');
		expect(validatePassword('ALLUPPERCASE1')).toBe('Password must include uppercase, lowercase, and a number');
		expect(validatePassword('alllowercase1')).toBe('Password must include uppercase, lowercase, and a number');
		expect(validatePassword('NoDigitsHereAbc')).toBe('Password must include uppercase, lowercase, and a number');
		expect(validatePassword('')).toBe('Password must be at least 12 characters');
	});

	it('maps provider password policy rejection without exposing provider text', () => {
		for (const error of [
			{ name: 'AuthWeakPasswordError', message: 'Rejected' },
			{ code: 'weak_password', message: 'Rejected' },
			{ message: 'Password should be at least 12 characters' },
			'Weak password: password does not meet requirement'
		]) {
			expect(mapProviderPasswordError(error)).toBe(
				'That password was rejected by account security rules. Choose a different, unique password with at least 12 characters, including uppercase, lowercase, and a number.'
			);
		}
		for (const error of [null, undefined, { message: 'Database is temporarily unavailable' }]) {
			expect(mapProviderPasswordError(error)).toBeNull();
		}
	});
});
