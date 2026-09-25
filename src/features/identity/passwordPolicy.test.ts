import { describe, expect, it } from 'vitest';
import {
	mapProviderPasswordError,
	PASSWORD_MAX_LENGTH_MESSAGE,
	PASSWORD_MIN_LENGTH_MESSAGE,
	PASSWORD_PROVIDER_REJECTION_MESSAGE,
	PASSWORD_REQUIREMENTS_MESSAGE,
	passwordRequirements,
	validatePassword
} from './passwordPolicy';

describe('password policy', () => {
	it('accepts the 128-character boundary and rejects a longer password', () => {
		const accepted = `Aa1${'x'.repeat(125)}`;
		const tooLong = `${accepted}x`;
		expect(passwordRequirements(accepted).valid).toBe(true);
		expect(validatePassword(accepted)).toBeNull();
		expect(passwordRequirements(tooLong)).toMatchObject({ maxLength: false, valid: false });
		expect(validatePassword(tooLong)).toBe(PASSWORD_MAX_LENGTH_MESSAGE);
	});

	it('rejects missing length and character classes with stable messages', () => {
		expect(validatePassword('Short1Aa')).toBe(PASSWORD_MIN_LENGTH_MESSAGE);
		expect(validatePassword('ALLUPPERCASE1')).toBe(PASSWORD_REQUIREMENTS_MESSAGE);
		expect(validatePassword('alllowercase1')).toBe(PASSWORD_REQUIREMENTS_MESSAGE);
		expect(validatePassword('NoDigitsHereAbc')).toBe(PASSWORD_REQUIREMENTS_MESSAGE);
		expect(validatePassword('')).toBe(PASSWORD_MIN_LENGTH_MESSAGE);
	});

	it('maps provider password policy rejection without exposing provider text', () => {
		for (const error of [
			{ name: 'AuthWeakPasswordError', message: 'Rejected' },
			{ code: 'weak_password', message: 'Rejected' },
			{ message: 'Password should be at least 12 characters' },
			'Weak password: password does not meet requirement'
		]) {
			expect(mapProviderPasswordError(error)).toBe(PASSWORD_PROVIDER_REJECTION_MESSAGE);
		}
		for (const error of [null, undefined, { message: 'Database is temporarily unavailable' }]) {
			expect(mapProviderPasswordError(error)).toBeNull();
		}
	});
});
