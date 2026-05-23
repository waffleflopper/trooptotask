const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX =
	/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_MIN_LENGTH_MESSAGE = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
export const PASSWORD_MAX_LENGTH_MESSAGE = `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`;
export const PASSWORD_REQUIREMENTS_MESSAGE = 'Password must include uppercase, lowercase, and a number';
export const PASSWORD_PROVIDER_REJECTION_MESSAGE = `That password was rejected by account security rules. Use at least ${PASSWORD_MIN_LENGTH} characters with uppercase, lowercase, and a number.`;

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
	if (!password || password.length < PASSWORD_MIN_LENGTH) {
		return PASSWORD_MIN_LENGTH_MESSAGE;
	}
	if (password.length > PASSWORD_MAX_LENGTH) {
		return PASSWORD_MAX_LENGTH_MESSAGE;
	}
	if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
		return PASSWORD_REQUIREMENTS_MESSAGE;
	}
	return null;
}

export function mapProviderPasswordError(error: unknown): string | null {
	const message =
		typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
			? error.message
			: typeof error === 'string'
				? error
				: '';
	const code =
		typeof error === 'object' && error && 'code' in error && typeof error.code === 'string' ? error.code : '';
	const name =
		typeof error === 'object' && error && 'name' in error && typeof error.name === 'string' ? error.name : '';
	const normalized = message.toLowerCase();
	if (code === 'weak_password' || name === 'AuthWeakPasswordError') {
		return PASSWORD_PROVIDER_REJECTION_MESSAGE;
	}
	if (
		normalized.includes('password') &&
		(normalized.includes('weak') ||
			normalized.includes('minimum') ||
			normalized.includes('at least') ||
			normalized.includes('requirement') ||
			normalized.includes('short'))
	) {
		return PASSWORD_PROVIDER_REJECTION_MESSAGE;
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
