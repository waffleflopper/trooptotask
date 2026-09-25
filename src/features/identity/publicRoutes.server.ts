const PUBLIC_ROUTE_PREFIXES = [
	'/',
	'/auth',
	'/api/auth/mfa/status',
	'/api/auth/update-password',
	'/api/auth/mfa/verify',
	'/api/access-requests',
	'/about',
	'/security',
	'/terms',
	'/privacy'
];

const PUBLIC_EXACT_ROUTES = new Set(['/api/cleanup-archived-records']);

export function isPublicRoute(pathname: string): boolean {
	return (
		PUBLIC_EXACT_ROUTES.has(pathname) ||
		PUBLIC_ROUTE_PREFIXES.some((route) => pathname === route || pathname.startsWith(route + '/'))
	);
}
