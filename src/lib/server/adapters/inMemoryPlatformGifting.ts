import type { PlatformGiftOrganization, PlatformGiftingStore } from '$lib/server/core/useCases/platformGifting';

interface InMemoryPlatformGiftingOptions {
	organizations?: PlatformGiftOrganization[];
	grantError?: Error;
	revokeError?: Error;
	extendError?: Error;
	listError?: Error;
}

function cloneOrganization(org: PlatformGiftOrganization): PlatformGiftOrganization {
	return { ...org };
}

export function createInMemoryPlatformGiftingStore(options: InMemoryPlatformGiftingOptions = {}): PlatformGiftingStore {
	const organizations = new Map<string, PlatformGiftOrganization>();
	for (const org of options.organizations ?? []) {
		organizations.set(org.id, cloneOrganization(org));
	}

	return {
		async listGiftableOrganizations() {
			if (options.listError) throw options.listError;
			return Array.from(organizations.values())
				.map(cloneOrganization)
				.sort((a, b) => a.name.localeCompare(b.name));
		},

		async getOrganizationGiftState(orgId) {
			const org = organizations.get(orgId);
			return org ? cloneOrganization(org) : null;
		},

		async grantGift(input) {
			if (options.grantError) throw options.grantError;
			const org = organizations.get(input.orgId);
			if (!org) return;
			organizations.set(input.orgId, {
				...org,
				giftTier: input.giftTier,
				giftExpiresAt: input.giftExpiresAt,
				giftedBy: input.giftedBy
			});
		},

		async revokeGift(orgId) {
			if (options.revokeError) throw options.revokeError;
			const org = organizations.get(orgId);
			if (!org) return;
			organizations.set(orgId, {
				...org,
				giftTier: null,
				giftExpiresAt: null,
				giftedBy: null
			});
		},

		async extendGift(input) {
			if (options.extendError) throw options.extendError;
			const org = organizations.get(input.orgId);
			if (!org) return;
			organizations.set(input.orgId, {
				...org,
				giftExpiresAt: input.giftExpiresAt
			});
		}
	};
}
