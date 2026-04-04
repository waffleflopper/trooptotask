const PUBLIC_ROUTE_PREFIXES = [
	'/',
	'/auth',
	'/api/auth',
	'/api/webhooks',
	'/demo',
	'/api/create-demo-sandbox',
	'/api/access-requests',
	'/features',
	'/pricing',
	'/security',
	'/terms',
	'/privacy',
	'/help',
	'/dashboard'
];

export function isPublicRoute(pathname: string): boolean {
	return PUBLIC_ROUTE_PREFIXES.some((route) => pathname === route || pathname.startsWith(route + '/'));
}
