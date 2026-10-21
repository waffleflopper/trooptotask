import { isUuid } from '$lib/utils/inputSchemas';

const EMAIL_REGEX =
	/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function sanitizeString(input: string | null | undefined, maxLength: number = 255): string {
	if (!input) return '';
	return input.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function validateEmail(email: string): boolean {
	if (!email || email.length > 254) return false;
	return EMAIL_REGEX.test(email);
}

export function validateUUID(id: string | null | undefined): boolean {
	return isUuid(id);
}

export function validateEnum<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
	if (!value) return null;
	return allowed.includes(value as T) ? (value as T) : null;
}

export function requireString(input: string | null | undefined, maxLength: number = 255): string | null {
	const sanitized = sanitizeString(input, maxLength);
	return sanitized.length > 0 ? sanitized : null;
}
