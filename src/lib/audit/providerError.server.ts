/** Query failures must remain failures without serializing provider payloads. */
export function assertAuditQuerySuccess(operation: string, response: { error: unknown }): void {
	if (response.error) throw new Error(`${operation} failed`);
}
