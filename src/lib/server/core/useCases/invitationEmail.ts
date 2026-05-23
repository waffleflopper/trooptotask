export function normalizeInvitationEmail(email?: string | null): string {
	return email?.trim().toLowerCase() ?? '';
}
