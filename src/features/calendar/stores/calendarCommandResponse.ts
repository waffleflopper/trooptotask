const NOT_SAVED_STATUSES = new Set([400, 401, 403, 404, 409]);

export function confirmedNotSaved(response: Response): boolean {
	return NOT_SAVED_STATUSES.has(response.status);
}
