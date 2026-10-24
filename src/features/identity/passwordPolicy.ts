export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 72;
export const PASSWORD_MIN_LENGTH_MESSAGE = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
export const PASSWORD_MAX_LENGTH_MESSAGE = `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`;
export const PASSWORD_MISMATCH_MESSAGE = 'Passwords do not match';
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

export type PasswordChecklistItem = { key: 'length' | 'case' | 'digit' | 'match'; label: string; met: boolean };

/** The live checklist for a new password and its confirmation; every item met means the pair is ready to submit. */
export function passwordChecklist(password: string, confirmation: string): PasswordChecklistItem[] {
	const requirements = passwordRequirements(password);
	return [
		{
			key: 'length',
			label: requirements.maxLength
				? `${PASSWORD_MIN_LENGTH}+ characters`
				: `${PASSWORD_MAX_LENGTH} characters or fewer`,
			met: requirements.minLength && requirements.maxLength
		},
		{ key: 'case', label: 'Upper and lower', met: requirements.uppercase && requirements.lowercase },
		{ key: 'digit', label: 'A number', met: requirements.digit },
		{ key: 'match', label: 'Both match', met: password.length > 0 && password === confirmation }
	];
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
