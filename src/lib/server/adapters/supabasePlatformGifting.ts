import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import { pauseSubscription, resumeSubscription } from '$lib/server/stripe';
import { invalidateTierCache } from '$lib/server/subscription';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import {
	createPlatformGifting,
	type PlatformGiftOrganization,
	type PlatformGifting,
	type PlatformGiftingStore
} from '$lib/server/core/useCases/platformGifting';
import type { Tier } from '$lib/types/subscription';

interface OrganizationGiftRow {
	id: string;
	name: string;
	tier: Tier;
	gift_tier: Tier | null;
	gift_expires_at: string | null;
	gifted_by: string | null;
	stripe_subscription_id: string | null;
	subscription_status: string | null;
	stripe_customer_id: string | null;
}

type SupabaseResponse<T> = {
	data: T | null;
	error: unknown;
};

type SupabaseQueryResult<T> = Promise<{ data: T[] | null; error: unknown }>;

const ORGANIZATION_GIFT_COLUMNS =
	'id, name, tier, gift_tier, gift_expires_at, gifted_by, stripe_subscription_id, subscription_status, stripe_customer_id';

function formatSupabaseError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	if (error && typeof error === 'object') {
		const candidate = error as { message?: unknown; code?: unknown };
		const message = typeof candidate.message === 'string' ? candidate.message : JSON.stringify(error);
		return typeof candidate.code === 'string' ? `${message} (${candidate.code})` : message;
	}
	return String(error);
}

function assertSupabaseSuccess<T>(operation: string, response: SupabaseResponse<T>): void {
	if (response.error) {
		throw new Error(`${operation} failed: ${formatSupabaseError(response.error)}`);
	}
}

function assertSupabaseUpdated(operation: string, response: SupabaseResponse<{ id: string }>): void {
	assertSupabaseSuccess(operation, response);
	if (!response.data) throw new Error(`${operation} failed: missing row`);
}

function mapOrganizationGift(row: OrganizationGiftRow): PlatformGiftOrganization {
	return {
		id: row.id,
		name: row.name,
		tier: row.tier,
		giftTier: row.gift_tier,
		giftExpiresAt: row.gift_expires_at,
		giftedBy: row.gifted_by,
		stripeSubscriptionId: row.stripe_subscription_id,
		subscriptionStatus: row.subscription_status,
		stripeCustomerId: row.stripe_customer_id
	};
}

export function createSupabasePlatformGiftingStore(supabase: SupabaseClient): PlatformGiftingStore {
	return {
		async listGiftableOrganizations() {
			const { data, error } = await selectAllSupabaseRows<OrganizationGiftRow>(
				(from, to) =>
					supabase
						.from('organizations')
						.select(ORGANIZATION_GIFT_COLUMNS)
						.order('name')
						.range(from, to) as unknown as SupabaseQueryResult<OrganizationGiftRow>
			);
			if (error) throw new Error(`table organizations gift list failed: ${formatSupabaseError(error)}`);
			return (data ?? []).map(mapOrganizationGift);
		},

		async getOrganizationGiftState(orgId) {
			const response = (await supabase
				.from('organizations')
				.select(ORGANIZATION_GIFT_COLUMNS)
				.eq('id', orgId)
				.maybeSingle()) as SupabaseResponse<OrganizationGiftRow>;
			assertSupabaseSuccess('table organizations gift fetch', response);
			return response.data ? mapOrganizationGift(response.data) : null;
		},

		async grantGift(input) {
			const response = (await supabase
				.from('organizations')
				.update({
					gift_tier: input.giftTier,
					gift_expires_at: input.giftExpiresAt,
					gifted_by: input.giftedBy
				})
				.eq('id', input.orgId)
				.select('id')
				.maybeSingle()) as SupabaseResponse<{ id: string }>;
			assertSupabaseUpdated('table organizations gift grant', response);
		},

		async revokeGift(orgId) {
			const response = (await supabase
				.from('organizations')
				.update({
					gift_tier: null,
					gift_expires_at: null,
					gifted_by: null
				})
				.eq('id', orgId)
				.select('id')
				.maybeSingle()) as SupabaseResponse<{ id: string }>;
			assertSupabaseUpdated('table organizations gift revoke', response);
		},

		async extendGift(input) {
			const response = (await supabase
				.from('organizations')
				.update({
					gift_expires_at: input.giftExpiresAt
				})
				.eq('id', input.orgId)
				.select('id')
				.maybeSingle()) as SupabaseResponse<{ id: string }>;
			assertSupabaseUpdated('table organizations gift extend', response);
		}
	};
}

export function createSupabasePlatformGifting(ctx: AdminContext): PlatformGifting {
	return createPlatformGifting({
		store: createSupabasePlatformGiftingStore(ctx.adminClient),
		actorUserId: ctx.adminUser.id,
		audit: (event) => ctx.audit(event),
		subscriptions: {
			pause: pauseSubscription,
			resume: resumeSubscription
		},
		invalidateTierCache
	});
}
