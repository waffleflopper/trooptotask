import type { Tier } from '$lib/types/subscription';

export type PlatformGiftTier = Exclude<Tier, 'free'>;
export type PlatformGiftAction = 'gift' | 'revoke' | 'extend';

export interface PlatformGiftOrganization {
	id: string;
	name: string;
	tier: Tier;
	giftTier: Tier | null;
	giftExpiresAt: string | null;
	giftedBy: string | null;
	stripeSubscriptionId: string | null;
	subscriptionStatus: string | null;
	stripeCustomerId: string | null;
}

export interface PlatformGiftingStore {
	listGiftableOrganizations(): Promise<PlatformGiftOrganization[]>;
	getOrganizationGiftState(orgId: string): Promise<PlatformGiftOrganization | null>;
	grantGift(input: {
		orgId: string;
		giftTier: PlatformGiftTier;
		giftExpiresAt: string;
		giftedBy: string;
	}): Promise<void>;
	revokeGift(orgId: string): Promise<void>;
	extendGift(input: { orgId: string; giftExpiresAt: string }): Promise<void>;
}

export interface PlatformGiftingAuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string;
	orgId?: string;
	details?: Record<string, unknown>;
	severity?: 'info' | 'warning' | 'critical';
}

export interface PlatformGiftingDependencies {
	store: PlatformGiftingStore;
	actorUserId: string;
	audit(event: PlatformGiftingAuditEvent): void;
	now?: () => Date;
	subscriptions?: {
		pause(stripeSubscriptionId: string): Promise<void>;
		resume(stripeSubscriptionId: string): Promise<void>;
	};
	invalidateTierCache?: (orgId: string) => void;
	logError?: (message: string, error: unknown) => void;
}

export type PlatformGiftUpdateResult =
	| {
			status: 'updated';
			action: PlatformGiftAction;
			orgId: string;
			giftTier?: PlatformGiftTier;
			days?: number;
			giftExpiresAt?: string;
	  }
	| { status: 'not_found' }
	| { status: 'no_active_gift' }
	| { status: 'tier_below_current'; currentTier: Tier; giftTier: PlatformGiftTier };

export interface PlatformGifting {
	listOrganizations(): Promise<PlatformGiftOrganization[]>;
	getOrganizationGiftState(orgId: string): Promise<PlatformGiftOrganization | null>;
	grantGift(input: { orgId: string; giftTier: PlatformGiftTier; days: number }): Promise<PlatformGiftUpdateResult>;
	revokeGift(orgId: string): Promise<PlatformGiftUpdateResult>;
	extendGift(input: { orgId: string; days: number }): Promise<PlatformGiftUpdateResult>;
}

const TIER_RANK: Record<Tier, number> = { free: 1, team: 2, unit: 3 };

export function isPlatformGiftTier(value: string): value is PlatformGiftTier {
	return value === 'team' || value === 'unit';
}

function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

export function createPlatformGifting(deps: PlatformGiftingDependencies): PlatformGifting {
	const now = deps.now ?? (() => new Date());
	const logError = deps.logError ?? ((message, error) => console.error(message, error));

	async function pauseSubscriptionIfNeeded(org: PlatformGiftOrganization, giftTier: PlatformGiftTier) {
		if (
			!org.stripeSubscriptionId ||
			org.subscriptionStatus !== 'active' ||
			TIER_RANK[giftTier] < TIER_RANK[org.tier] ||
			!deps.subscriptions
		) {
			return;
		}

		try {
			await deps.subscriptions.pause(org.stripeSubscriptionId);
		} catch (error) {
			logError('[admin/gifting] Failed to pause subscription:', error);
		}
	}

	async function resumeSubscriptionIfNeeded(org: PlatformGiftOrganization) {
		if (!org.stripeSubscriptionId || org.subscriptionStatus !== 'paused' || !deps.subscriptions) return;

		try {
			await deps.subscriptions.resume(org.stripeSubscriptionId);
		} catch (error) {
			logError('[admin/gifting] Failed to resume subscription:', error);
		}
	}

	function finishSuccessfulChange(orgId: string): void {
		deps.invalidateTierCache?.(orgId);
	}

	return {
		async listOrganizations() {
			try {
				return await deps.store.listGiftableOrganizations();
			} catch (error) {
				logError('[admin/gifting] Failed to fetch organizations:', error);
				return [];
			}
		},

		getOrganizationGiftState(orgId) {
			return deps.store.getOrganizationGiftState(orgId);
		},

		async grantGift(input) {
			const org = await deps.store.getOrganizationGiftState(input.orgId);
			if (!org) return { status: 'not_found' };
			if (TIER_RANK[input.giftTier] < TIER_RANK[org.tier]) {
				return { status: 'tier_below_current', currentTier: org.tier, giftTier: input.giftTier };
			}

			const giftExpiresAt = addDays(now(), input.days).toISOString();
			await deps.store.grantGift({
				orgId: input.orgId,
				giftTier: input.giftTier,
				giftExpiresAt,
				giftedBy: deps.actorUserId
			});
			await pauseSubscriptionIfNeeded(org, input.giftTier);

			deps.audit({
				action: 'admin.org.gift_tier',
				resourceType: 'organization',
				resourceId: input.orgId,
				orgId: input.orgId,
				details: { giftTier: input.giftTier, days: input.days },
				severity: 'warning'
			});
			finishSuccessfulChange(input.orgId);

			return {
				status: 'updated',
				action: 'gift',
				orgId: input.orgId,
				giftTier: input.giftTier,
				days: input.days,
				giftExpiresAt
			};
		},

		async revokeGift(orgId) {
			const org = await deps.store.getOrganizationGiftState(orgId);
			if (!org) return { status: 'not_found' };

			await deps.store.revokeGift(orgId);
			await resumeSubscriptionIfNeeded(org);

			deps.audit({
				action: 'admin.org.revoke_gift',
				resourceType: 'organization',
				resourceId: orgId,
				orgId,
				severity: 'warning'
			});
			finishSuccessfulChange(orgId);

			return { status: 'updated', action: 'revoke', orgId };
		},

		async extendGift(input) {
			const org = await deps.store.getOrganizationGiftState(input.orgId);
			if (!org) return { status: 'not_found' };
			if (!org.giftTier) return { status: 'no_active_gift' };

			const currentTime = now();
			const currentExpiry = org.giftExpiresAt ? new Date(org.giftExpiresAt) : currentTime;
			const baseDate = currentExpiry > currentTime ? currentExpiry : currentTime;
			const giftExpiresAt = addDays(baseDate, input.days).toISOString();
			await deps.store.extendGift({ orgId: input.orgId, giftExpiresAt });

			deps.audit({
				action: 'admin.org.extend_gift',
				resourceType: 'organization',
				resourceId: input.orgId,
				orgId: input.orgId,
				details: { days: input.days },
				severity: 'info'
			});
			finishSuccessfulChange(input.orgId);

			return {
				status: 'updated',
				action: 'extend',
				orgId: input.orgId,
				days: input.days,
				giftExpiresAt
			};
		}
	};
}
