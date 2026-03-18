const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX =
	/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Sanitize a string: trim whitespace, collapse internal whitespace, cap length.
 */
export function sanitizeString(input: string | null | undefined, maxLength: number = 255): string {
	if (!input) return '';
	return input.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

/**
 * Validate an email address.
 */
export function validateEmail(email: string): boolean {
	if (!email || email.length > 254) return false;
	return EMAIL_REGEX.test(email);
}

/**
 * Validate a UUID string.
 */
export function validateUUID(id: string | null | undefined): boolean {
	if (!id) return false;
	return UUID_REGEX.test(id);
}

/**
 * Validate that a value is one of the allowed enum values.
 */
export function validateEnum<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
	if (!value) return null;
	return allowed.includes(value as T) ? (value as T) : null;
}

/**
 * Validate a password meets strength requirements.
 * Returns null if valid, or an error message string if invalid.
 */
export function validatePassword(password: string): string | null {
	if (!password || password.length < 12) {
		return 'Password must be at least 12 characters';
	}
	if (password.length > 128) {
		return 'Password must be 128 characters or fewer';
	}
	if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
		return 'Password must include uppercase, lowercase, and a number';
	}
	return null;
}

/**
 * Validate a string is non-empty after trimming.
 */
export function requireString(input: string | null | undefined, maxLength: number = 255): string | null {
	const sanitized = sanitizeString(input, maxLength);
	return sanitized.length > 0 ? sanitized : null;
}
