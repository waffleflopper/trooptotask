import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from '$lib/server/supabase';

export interface DurableRateLimitStore {
	checkBucket(input: {
		key: string;
		windowMs: number;
		maxRequests: number;
		now: Date;
	}): Promise<{ limited: false } | { limited: true; retryAfterMs: number }>;
}

export interface DurableRateLimitDimension {
	name: string;
	value: string | null | undefined;
}

export interface DurableRateLimitDecisionMetadata {
	namespace: string;
	dimensions: string[];
	limitedDimensions: string[];
	windowMs: number;
	maxRequests: number;
	retryAfterMs?: number;
}

export type DurableRateLimitDecision =
	| ({ limited: false } & DurableRateLimitDecisionMetadata)
	| ({ limited: true; retryAfterMs: number } & DurableRateLimitDecisionMetadata);

export function createSupabaseDurableRateLimitStore(
	supabase: SupabaseClient = getAdminClient()
): DurableRateLimitStore {
	return {
		async checkBucket(input) {
			const { data, error } = await supabase.rpc('check_durable_rate_limit', {
				p_bucket_key: input.key,
				p_window_seconds: Math.ceil(input.windowMs / 1000),
				p_max_requests: input.maxRequests,
				p_checked_at: input.now.toISOString()
			});

			if (error) {
				throw error;
			}

			// The RPC returns one decision. Missing or ambiguous data cannot authorize a request.
			const row: unknown = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data;
			if (
				error !== null ||
				!row ||
				typeof row !== 'object' ||
				!('limited' in row) ||
				typeof row.limited !== 'boolean' ||
				!('retry_after_ms' in row) ||
				typeof row.retry_after_ms !== 'number' ||
				!Number.isSafeInteger(row.retry_after_ms) ||
				row.retry_after_ms < 0
			) {
				throw new Error('Durable rate limit check returned an invalid result');
			}

			if (row.limited) {
				return { limited: true, retryAfterMs: row.retry_after_ms };
			}

			return { limited: false };
		}
	};
}

export function normalizeRateLimitEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function hashRateLimitDimension(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function bucketKey(namespace: string, dimension: DurableRateLimitDimension): string | null {
	const value = dimension.value?.trim();
	if (!value) return null;
	return `${namespace}:${dimension.name}:${hashRateLimitDimension(value)}`;
}

export async function checkDurableRateLimit(input: {
	namespace: string;
	dimensions: DurableRateLimitDimension[];
	windowMs: number;
	maxRequests: number;
	now?: Date;
	store?: DurableRateLimitStore;
}): Promise<DurableRateLimitDecision> {
	const now = input.now ?? new Date();
	const store = input.store ?? createSupabaseDurableRateLimitStore();
	const keys = input.dimensions
		.map((dimension) => ({ dimension, key: bucketKey(input.namespace, dimension) }))
		.filter((entry): entry is { dimension: DurableRateLimitDimension; key: string } => entry.key !== null);

	let retryAfterMs = 0;
	const limitedDimensions: string[] = [];

	for (const { dimension, key } of keys) {
		const result = await store.checkBucket({
			key,
			windowMs: input.windowMs,
			maxRequests: input.maxRequests,
			now
		});
		if (result.limited) {
			retryAfterMs = Math.max(retryAfterMs, result.retryAfterMs);
			limitedDimensions.push(dimension.name);
		}
	}

	const metadata = {
		namespace: input.namespace,
		dimensions: keys.map(({ dimension }) => dimension.name),
		limitedDimensions,
		windowMs: input.windowMs,
		maxRequests: input.maxRequests
	};

	if (limitedDimensions.length > 0) {
		return { ...metadata, limited: true, retryAfterMs };
	}

	return { ...metadata, limited: false };
}

export function durableRateLimitAuditDetails(decision: DurableRateLimitDecision): Record<string, unknown> {
	return {
		namespace: decision.namespace,
		dimensions: decision.dimensions,
		limitedDimensions: decision.limitedDimensions,
		windowMs: decision.windowMs,
		maxRequests: decision.maxRequests,
		...(decision.limited ? { retryAfterMs: decision.retryAfterMs } : {})
	};
}
