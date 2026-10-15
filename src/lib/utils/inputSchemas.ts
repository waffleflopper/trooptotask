import { z } from 'zod';
import { isDateOnly } from './dates';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DATE_ONLY_MESSAGE = 'Use a valid date (YYYY-MM-DD)';

/** Accepts any hex UUID shape; zod's `z.uuid()` also enforces RFC versions, which synthetic ids do not carry. */
export function isUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value);
}

export const uuidSchema = z.string({ error: 'Invalid ID' }).refine(isUuid, 'Invalid ID');

export const dateOnlySchema = z.string({ error: DATE_ONLY_MESSAGE }).refine(isDateOnly, DATE_ONLY_MESSAGE);

/** Joins a failed parse into one public message, naming a repeated problem once. */
export function issueMessage(error: z.ZodError): string {
	return [...new Set(error.issues.map((issue) => issue.message))].join('; ');
}
