/**
 * Framework-agnostic error helper for use cases.
 * Throws an Error with a `status` property that httpAdapter's rethrowOrWrap() will re-throw.
 */
export function fail(status: number, message: string): never {
	const err = new Error(message);
	(err as unknown as Record<string, unknown>).status = status;
	throw err;
}
