export function isPrivilegedRole(role: string): boolean {
	return role === 'owner' || role === 'admin';
}
