/**
 * How one client save ended, as the user sees it. `unconfirmed` means no reply proved either way, so the
 * user reloads before trying again. `stale` means the Organization, dialog or request moved on and the
 * result belongs to nobody. `busy` means another change was still settling, so this one was not sent.
 */
export type SaveOutcome = 'saved' | 'not-saved' | 'unconfirmed' | 'stale' | 'busy';

/** What a write's reply proves on its own. */
export type WriteOutcome = Extract<SaveOutcome, 'saved' | 'not-saved' | 'unconfirmed'>;

/**
 * Decides what a write's reply proves. Pass the reply's status, a `Response`, a SvelteKit `ActionResult`, a
 * `StoreRequestError` or whatever was thrown. A 2xx or 3xx saved, and a 4xx refused the write. A 5xx, a thrown
 * fetch or anything without a status may have saved after all. A 2xx whose body can't be read is the caller's
 * to report as unconfirmed.
 */
export function classifyWrite(reply: unknown): WriteOutcome {
	const status = statusOf(reply);
	if (status === null) return 'unconfirmed';
	if (status >= 200 && status < 400) return 'saved';
	if (status >= 400 && status < 500) return 'not-saved';
	return 'unconfirmed';
}

function statusOf(reply: unknown): number | null {
	if (typeof reply === 'number') return Number.isInteger(reply) ? reply : null;
	if (typeof reply !== 'object' || reply === null || !('status' in reply)) return null;
	const { status } = reply;
	return typeof status === 'number' && Number.isInteger(status) ? status : null;
}
