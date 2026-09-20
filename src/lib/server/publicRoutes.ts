const PUBLIC_ROUTE_PREFIXES = [
	'/',
	'/auth',
	'/api/auth/establish-session',
	'/api/auth/mfa/status',
	'/api/auth/update-password',
	'/api/auth/mfa/verify',
	'/api/webhooks',
	'/api/access-requests',
	'/about',
	'/security',
	'/terms',
	'/privacy'
];

export function isPublicRoute(pathname: string): boolean {
	return PUBLIC_ROUTE_PREFIXES.some((route) => pathname === route || pathname.startsWith(route + '/'));
}
