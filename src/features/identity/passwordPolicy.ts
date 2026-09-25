export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_MIN_LENGTH_MESSAGE = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
export const PASSWORD_MAX_LENGTH_MESSAGE = `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`;
export const PASSWORD_REQUIREMENTS_MESSAGE = 'Password must include uppercase, lowercase, and a number';
export const PASSWORD_PROVIDER_REJECTION_MESSAGE = `That password was rejected by account security rules. Choose a different, unique password with at least ${PASSWORD_MIN_LENGTH} characters, including uppercase, lowercase, and a number.`;

export function passwordRequirements(password: string) {
	const minLength = password.length >= PASSWORD_MIN_LENGTH;
	const maxLength = password.length <= PASSWORD_MAX_LENGTH;
	const lowercase = /[a-z]/.test(password);
	const uppercase = /[A-Z]/.test(password);
	const digit = /[0-9]/.test(password);
	return {
		minLength,
		maxLength,
		lowercase,
		uppercase,
		digit,
		valid: minLength && maxLength && lowercase && uppercase && digit
	};
}

/** Returns null for an accepted password, or the current user-facing error. */
export function validatePassword(password: string): string | null {
	const requirements = passwordRequirements(password);
	if (!requirements.minLength) return PASSWORD_MIN_LENGTH_MESSAGE;
	if (!requirements.maxLength) return PASSWORD_MAX_LENGTH_MESSAGE;
	if (!requirements.lowercase || !requirements.uppercase || !requirements.digit) {
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
