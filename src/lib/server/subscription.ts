/**
 * Retained as a compatibility hook for ports that invalidate billing reads after writes.
 * The former RPC-backed tier cache has been retired; current reads use app-owned plan policy modules.
 */
export function invalidateTierCache(orgId: string): void {
	void orgId;
}
