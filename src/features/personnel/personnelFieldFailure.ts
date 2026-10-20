import type { z } from 'zod';
import { fail } from '$lib/errors';
import { issueMessage } from '$lib/utils/inputSchemas';

const FIELD_REASON_PREFIX = 'field:';

/** A 400 that names the form field it rejects, so a client can show it beside that field. */
export function failField(field: string, message: string): never {
	fail(400, message, { reason: `${FIELD_REASON_PREFIX}${field}` });
}

/** A failed parse names the field of its first issue; the message still lists every issue. */
export function failParse(error: z.ZodError): never {
	const field = error.issues[0]?.path[0];
	if (typeof field === 'string') failField(field, issueMessage(error));
	fail(400, issueMessage(error));
}

export function fieldFromFailureReason(reason: unknown): string | null {
	return typeof reason === 'string' && reason.startsWith(FIELD_REASON_PREFIX)
		? reason.slice(FIELD_REASON_PREFIX.length)
		: null;
}
