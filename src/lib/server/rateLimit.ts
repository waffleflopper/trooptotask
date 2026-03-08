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

// Clean stale entries every 5 minutes
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of store) {
		if (now > entry.resetAt) {
			store.delete(key);
		}
	}
}, 5 * 60 * 1000);

const rules: RateLimitRule[] = [
	{ pattern: /^\/auth\//, windowMs: 15 * 60 * 1000, maxRequests: 10 },
	{ pattern: /^\/api\/access-requests/, windowMs: 60 * 60 * 1000, maxRequests: 5 },
	{ pattern: /^\/api\/create-demo-sandbox/, windowMs: 60 * 60 * 1000, maxRequests: 3 },
	{
		pattern: /^\/org\/[^/]+\/api\/export/,
		windowMs: 60 * 60 * 1000,
		maxRequests: 10,
		methods: ['POST']
	},
	{
		pattern: /^\/org\/[^/]+\/api\//,
		windowMs: 60 * 1000,
		maxRequests: 30,
		methods: ['POST', 'PUT', 'DELETE']
	},
	{ pattern: /.*/, windowMs: 60 * 1000, maxRequests: 60 }
];

export function checkRateLimit(
	ip: string,
	pathname: string,
	method: string
): { limited: false } | { limited: true; retryAfterMs: number } {
	for (const rule of rules) {
		if (!rule.pattern.test(pathname)) continue;
		if (rule.methods && !rule.methods.includes(method)) continue;

		const key = `${ip}:${rule.pattern.source}`;
		const now = Date.now();
		const entry = store.get(key);

		if (!entry || now > entry.resetAt) {
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
