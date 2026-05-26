<script lang="ts">
	import { TIER_CONFIG, type EffectiveTier } from '$lib/types/subscription';
	import OrganizationSettingsSection from './OrganizationSettingsSection.svelte';
	import type { OrganizationSettingsWorkspace } from './organizationSettingsWorkspaceModel';
	import type { PlanUsageSummaryForSettings } from './settingsTypes';
	import { formatCap, formatExportLimit, formatPrice } from './settingsWorkspaceFormatters';

	type SettingsPageData = {
		effectiveTier?: EffectiveTier | null;
		planUsageSummary: PlanUsageSummaryForSettings;
		workspace: OrganizationSettingsWorkspace;
	};

	type SettingsActionData = {
		[key: string]: unknown;
		nameSuccess?: boolean;
		slugSuccess?: boolean;
		error?: string;
		slugError?: string;
	} | null;

	let {
		data,
		form,
		showBilling = false
	} = $props<{
		data: unknown;
		form: SettingsActionData;
		showBilling?: boolean;
	}>();

	let nameLoading = $state(false);
	let slugLoading = $state(false);
	const settingsData = $derived(data as SettingsPageData);
	const organizationSection = $derived(settingsData.workspace.sections.organization);
	const membersSection = $derived(settingsData.workspace.sections.members);
	const tier = $derived(
		settingsData.effectiveTier ??
			({
				tier: 'free',
				source: 'default',
				personnelCount: membersSection.rows.length,
				personnelCap: TIER_CONFIG.free.personnelCap,
				isReadOnly: false,
				readOnlyReason: null,
				giftExpiresAt: null,
				giftTier: null
			} satisfies EffectiveTier)
	);
	const tierConfig = $derived(TIER_CONFIG[tier.tier as keyof typeof TIER_CONFIG]);
	const planName = $derived(tierConfig.name);
	const planBadge = $derived(`${planName} tier`);
	const planPrice = $derived(formatPrice(tierConfig.priceMonthly));
	const planCopy = $derived(
		`Includes ${formatCap(tierConfig.personnelCap).toLowerCase()} members, audit log, ${formatExportLimit(tierConfig.bulkExportsPerMonth)}.`
	);
	const personnelCount = $derived(`${tier.personnelCount} / ${formatCap(tierConfig.personnelCap).toUpperCase()}`);
	const billingStatus = $derived(getBillingStatus(tier));

	function getBillingStatus(tier: EffectiveTier): string {
		if (tier.isReadOnly) return 'Read-only';
		if (tier.source === 'gift') return 'Gifted access';
		return 'Active';
	}
</script>

<OrganizationSettingsSection
	organization={organizationSection}
	{form}
	bind:nameLoading
	bind:slugLoading
	{planBadge}
	{planPrice}
	{planCopy}
	{billingStatus}
	{personnelCount}
	planUsageSummary={settingsData.planUsageSummary}
	showProfile={!showBilling}
	{showBilling}
/>
