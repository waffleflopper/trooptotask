interface RateLimitEntry {
	count: number;
	resetAt: number;
}

interface RateLimitRule {
	pattern: RegExp;
	windowMs: number;
	maxRequests: number;
	methods?: string[];
}

const store = new Map<string, RateLimitEntry>();

setInterval(
	() => {
		const now = Date.now();
		for (const [key, entry] of store) {
			if (now >= entry.resetAt) {
				store.delete(key);
			}
		}
	},
	5 * 60 * 1000
);

const rules: RateLimitRule[] = [
	{ pattern: /^\/auth\/renew-invite$/, windowMs: 60 * 60 * 1000, maxRequests: 5, methods: ['POST'] },
	{ pattern: /^\/auth\//, windowMs: 15 * 60 * 1000, maxRequests: 10, methods: ['POST'] },
	{
		pattern: /^\/org\/[^/]+\/api\/export/,
		windowMs: 60 * 60 * 1000,
		maxRequests: 10,
		methods: ['POST']
	},
	{
		pattern: /^\/org\/[^/]+\/api\/getting-started/,
		windowMs: 60 * 1000,
		maxRequests: 20,
		methods: ['POST', 'DELETE']
	},
	{
		pattern: /^\/org\/[^/]+\/api\//,
		windowMs: 60 * 1000,
		maxRequests: 30,
		methods: ['POST', 'PUT', 'DELETE']
	},
	{ pattern: /^\/admin\/api\/search$/, windowMs: 60_000, maxRequests: 30 },
	{ pattern: /^\/admin\/api\/suspend$/, windowMs: 60_000 * 15, maxRequests: 10, methods: ['POST'] },
	{ pattern: /^\/admin\/announcements$/, windowMs: 60_000, maxRequests: 20, methods: ['POST'] },
	{ pattern: /^\/api\/announcements\/dismiss$/, windowMs: 60_000, maxRequests: 20, methods: ['POST'] },
	{ pattern: /.*/, windowMs: 60 * 1000, maxRequests: 60 }
];

// SvelteKit routes the decoded path, so /%61uth/login must spend the /auth/ budget.
function routedPathname(pathname: string): string {
	try {
		return pathname.split('%25').map(decodeURI).join('%25');
	} catch {
		return pathname;
	}
}

export function checkRateLimit(
	ip: string,
	pathname: string,
	method: string
): { limited: false } | { limited: true; retryAfterMs: number } {
	const routed = routedPathname(pathname);
	for (const rule of rules) {
		if (!rule.pattern.test(routed)) continue;
		if (rule.methods && !rule.methods.includes(method)) continue;

		const key = `${ip}:${rule.pattern.source}`;
		const now = Date.now();
		const entry = store.get(key);

		if (!entry || now >= entry.resetAt) {
			store.set(key, { count: 1, resetAt: now + rule.windowMs });
			return { limited: false };
		}

		entry.count++;

		if (entry.count > rule.maxRequests) {
			const retryAfterMs = entry.resetAt - now;
			return { limited: true, retryAfterMs };
		}

		return { limited: false };
	}

	return { limited: false };
}
