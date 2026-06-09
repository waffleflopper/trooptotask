import { describe, expect, it, vi } from 'vitest';
import { createInMemoryPlatformGiftingStore } from '$lib/server/adapters/inMemoryPlatformGifting';
import { createPlatformGifting } from './platformGifting';

describe('PlatformGifting', () => {
	it('grants a gift through the public interface and applies successful side effects', async () => {
		const audit = vi.fn();
		const pauseSubscription = vi.fn().mockResolvedValue(undefined);
		const invalidateTierCache = vi.fn();
		const store = createInMemoryPlatformGiftingStore({
			organizations: [
				{
					id: 'org-1',
					name: 'Able Company',
					tier: 'free',
					giftTier: null,
					giftExpiresAt: null,
					giftedBy: null,
					stripeSubscriptionId: 'sub_123',
					subscriptionStatus: 'active',
					stripeCustomerId: 'cus_123'
				}
			]
		});
		const gifting = createPlatformGifting({
			store,
			actorUserId: 'admin-1',
			audit,
			now: () => new Date('2026-06-01T12:00:00.000Z'),
			subscriptions: { pause: pauseSubscription, resume: vi.fn() },
			invalidateTierCache
		});

		const result = await gifting.grantGift({ orgId: 'org-1', giftTier: 'team', days: 30 });

		expect(result).toEqual({
			status: 'updated',
			action: 'gift',
			orgId: 'org-1',
			giftTier: 'team',
			days: 30,
			giftExpiresAt: '2026-07-01T12:00:00.000Z'
		});
		await expect(gifting.getOrganizationGiftState('org-1')).resolves.toMatchObject({
			giftTier: 'team',
			giftExpiresAt: '2026-07-01T12:00:00.000Z',
			giftedBy: 'admin-1'
		});
		expect(pauseSubscription).toHaveBeenCalledWith('sub_123');
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'admin.org.gift_tier',
				resourceType: 'organization',
				resourceId: 'org-1',
				orgId: 'org-1',
				details: { giftTier: 'team', days: 30 },
				severity: 'warning'
			})
		);
		expect(invalidateTierCache).toHaveBeenCalledWith('org-1');
	});

	it('rejects gifts below the organization current tier without applying side effects', async () => {
		const audit = vi.fn();
		const pauseSubscription = vi.fn();
		const invalidateTierCache = vi.fn();
		const store = createInMemoryPlatformGiftingStore({
			organizations: [
				{
					id: 'org-1',
					name: 'Able Company',
					tier: 'unit',
					giftTier: null,
					giftExpiresAt: null,
					giftedBy: null,
					stripeSubscriptionId: 'sub_123',
					subscriptionStatus: 'active',
					stripeCustomerId: 'cus_123'
				}
			]
		});
		const gifting = createPlatformGifting({
			store,
			actorUserId: 'admin-1',
			audit,
			now: () => new Date('2026-06-01T12:00:00.000Z'),
			subscriptions: { pause: pauseSubscription, resume: vi.fn() },
			invalidateTierCache
		});

		await expect(gifting.grantGift({ orgId: 'org-1', giftTier: 'team', days: 30 })).resolves.toEqual({
			status: 'tier_below_current',
			currentTier: 'unit',
			giftTier: 'team'
		});
		await expect(gifting.getOrganizationGiftState('org-1')).resolves.toMatchObject({
			tier: 'unit',
			giftTier: null,
			giftExpiresAt: null,
			giftedBy: null
		});
		expect(pauseSubscription).not.toHaveBeenCalled();
		expect(audit).not.toHaveBeenCalled();
		expect(invalidateTierCache).not.toHaveBeenCalled();
	});

	it('revokes a gift and resumes paused subscriptions through the public interface', async () => {
		const audit = vi.fn();
		const resumeSubscription = vi.fn().mockResolvedValue(undefined);
		const invalidateTierCache = vi.fn();
		const store = createInMemoryPlatformGiftingStore({
			organizations: [
				{
					id: 'org-1',
					name: 'Able Company',
					tier: 'team',
					giftTier: 'unit',
					giftExpiresAt: '2026-08-01T00:00:00.000Z',
					giftedBy: 'admin-1',
					stripeSubscriptionId: 'sub_123',
					subscriptionStatus: 'paused',
					stripeCustomerId: 'cus_123'
				}
			]
		});
		const gifting = createPlatformGifting({
			store,
			actorUserId: 'admin-2',
			audit,
			subscriptions: { pause: vi.fn(), resume: resumeSubscription },
			invalidateTierCache
		});

		await expect(gifting.revokeGift('org-1')).resolves.toEqual({
			status: 'updated',
			action: 'revoke',
			orgId: 'org-1'
		});
		await expect(gifting.getOrganizationGiftState('org-1')).resolves.toMatchObject({
			giftTier: null,
			giftExpiresAt: null,
			giftedBy: null
		});
		expect(resumeSubscription).toHaveBeenCalledWith('sub_123');
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'admin.org.revoke_gift',
				resourceType: 'organization',
				resourceId: 'org-1',
				orgId: 'org-1',
				severity: 'warning'
			})
		);
		expect(invalidateTierCache).toHaveBeenCalledWith('org-1');
	});

	it('extends gifts from the future expiry or from now when the gift has expired', async () => {
		const store = createInMemoryPlatformGiftingStore({
			organizations: [
				{
					id: 'future-org',
					name: 'Future Org',
					tier: 'free',
					giftTier: 'team',
					giftExpiresAt: '2026-06-10T00:00:00.000Z',
					giftedBy: 'admin-1',
					stripeSubscriptionId: null,
					subscriptionStatus: null,
					stripeCustomerId: null
				},
				{
					id: 'expired-org',
					name: 'Expired Org',
					tier: 'free',
					giftTier: 'team',
					giftExpiresAt: '2026-05-10T00:00:00.000Z',
					giftedBy: 'admin-1',
					stripeSubscriptionId: null,
					subscriptionStatus: null,
					stripeCustomerId: null
				}
			]
		});
		const gifting = createPlatformGifting({
			store,
			actorUserId: 'admin-2',
			audit: vi.fn(),
			now: () => new Date('2026-06-01T12:00:00.000Z')
		});

		await expect(gifting.extendGift({ orgId: 'future-org', days: 5 })).resolves.toMatchObject({
			status: 'updated',
			giftExpiresAt: '2026-06-15T00:00:00.000Z'
		});
		await expect(gifting.extendGift({ orgId: 'expired-org', days: 5 })).resolves.toMatchObject({
			status: 'updated',
			giftExpiresAt: '2026-06-06T12:00:00.000Z'
		});
	});

	it('does not audit or invalidate when a grant store command fails', async () => {
		const audit = vi.fn();
		const invalidateTierCache = vi.fn();
		const pauseSubscription = vi.fn();
		const gifting = createPlatformGifting({
			store: createInMemoryPlatformGiftingStore({
				grantError: new Error('provider unavailable'),
				organizations: [
					{
						id: 'org-1',
						name: 'Able Company',
						tier: 'free',
						giftTier: null,
						giftExpiresAt: null,
						giftedBy: null,
						stripeSubscriptionId: 'sub_123',
						subscriptionStatus: 'active',
						stripeCustomerId: 'cus_123'
					}
				]
			}),
			actorUserId: 'admin-1',
			audit,
			now: () => new Date('2026-06-01T12:00:00.000Z'),
			subscriptions: { pause: pauseSubscription, resume: vi.fn() },
			invalidateTierCache
		});

		await expect(gifting.grantGift({ orgId: 'org-1', giftTier: 'team', days: 30 })).rejects.toThrow(
			'provider unavailable'
		);
		expect(pauseSubscription).not.toHaveBeenCalled();
		expect(audit).not.toHaveBeenCalled();
		expect(invalidateTierCache).not.toHaveBeenCalled();
	});

	it('does not audit or invalidate when revoke or extend store commands fail', async () => {
		const createFailingSubject = (options: { revokeError?: Error; extendError?: Error }) => {
			const audit = vi.fn();
			const invalidateTierCache = vi.fn();
			const gifting = createPlatformGifting({
				store: createInMemoryPlatformGiftingStore({
					...options,
					organizations: [
						{
							id: 'org-1',
							name: 'Able Company',
							tier: 'free',
							giftTier: 'team',
							giftExpiresAt: '2026-06-10T00:00:00.000Z',
							giftedBy: 'admin-1',
							stripeSubscriptionId: null,
							subscriptionStatus: null,
							stripeCustomerId: null
						}
					]
				}),
				actorUserId: 'admin-1',
				audit,
				now: () => new Date('2026-06-01T12:00:00.000Z'),
				invalidateTierCache
			});
			return { gifting, audit, invalidateTierCache };
		};

		const revokeSubject = createFailingSubject({ revokeError: new Error('revoke failed') });
		await expect(revokeSubject.gifting.revokeGift('org-1')).rejects.toThrow('revoke failed');
		expect(revokeSubject.audit).not.toHaveBeenCalled();
		expect(revokeSubject.invalidateTierCache).not.toHaveBeenCalled();

		const extendSubject = createFailingSubject({ extendError: new Error('extend failed') });
		await expect(extendSubject.gifting.extendGift({ orgId: 'org-1', days: 5 })).rejects.toThrow('extend failed');
		expect(extendSubject.audit).not.toHaveBeenCalled();
		expect(extendSubject.invalidateTierCache).not.toHaveBeenCalled();
	});

	it('reports missing organizations and missing active gifts without side effects', async () => {
		const audit = vi.fn();
		const invalidateTierCache = vi.fn();
		const store = createInMemoryPlatformGiftingStore({
			organizations: [
				{
					id: 'org-1',
					name: 'Able Company',
					tier: 'free',
					giftTier: null,
					giftExpiresAt: null,
					giftedBy: null,
					stripeSubscriptionId: null,
					subscriptionStatus: null,
					stripeCustomerId: null
				}
			]
		});
		const gifting = createPlatformGifting({
			store,
			actorUserId: 'admin-1',
			audit,
			invalidateTierCache
		});

		await expect(gifting.grantGift({ orgId: 'missing-org', giftTier: 'team', days: 30 })).resolves.toEqual({
			status: 'not_found'
		});
		await expect(gifting.revokeGift('org-1')).resolves.toEqual({ status: 'no_active_gift' });
		await expect(gifting.extendGift({ orgId: 'org-1', days: 30 })).resolves.toEqual({ status: 'no_active_gift' });
		expect(audit).not.toHaveBeenCalled();
		expect(invalidateTierCache).not.toHaveBeenCalled();
	});
});
