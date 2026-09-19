<script lang="ts">
	import type { PageProps } from './$types';
	import { TIER_CONFIG, type EffectiveTier } from '$lib/types/subscription';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { isBillingEnabled } from '$lib/config/billing';
	import { formatCap, formatExportLimit, formatPrice } from '../settingsWorkspaceFormatters';

	let { data }: PageProps = $props();

	function getBillingStatus(tier: EffectiveTier): string {
		if (tier.isReadOnly) return 'Read-only';
		if (tier.source === 'gift') return 'Gifted access';
		return 'Active';
	}
	function usageStatusLabel(status: string): string {
		switch (status) {
			case 'over_limit':
				return 'Over limit';
			case 'limit_reached':
				return 'Limit reached';
			case 'read_only':
				return 'Read-only';
			default:
				return 'Within limit';
		}
	}

	function usageStatusVariant(status: string): BadgeVariant {
		if (status === 'over_limit') return 'destructive';
		if (status === 'limit_reached' || status === 'read_only') return 'warning';
		return 'secondary';
	}
</script>

{#if data.effectiveTier}
	{@const tier = data.effectiveTier}
	{@const tierConfig = TIER_CONFIG[tier.tier]}
	{@const planBadge = `${tierConfig.name} tier`}
	{@const planPrice = formatPrice(tierConfig.priceMonthly)}
	{@const planCopy = `Includes ${formatCap(tierConfig.personnelCap).toLowerCase()} members, audit log, ${formatExportLimit(tierConfig.bulkExportsPerMonth)}.`}
	{@const personnelCount = `${tier.personnelCount} / ${formatCap(tierConfig.personnelCap).toUpperCase()}`}
	{@const billingStatus = getBillingStatus(tier)}
	{@const planUsageSummary = data.planUsageSummary}
	<div class="grid gap-4">
		<section class="grid gap-4 rounded-lg border bg-card p-4" aria-labelledby="subscription-heading">
			<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
				<div class="grid gap-1">
					<h2 id="subscription-heading" class="font-heading text-lg font-semibold tracking-tight">
						Subscription & Billing
					</h2>
					<p class="text-sm text-muted-foreground">{planCopy}</p>
				</div>
				<Badge>{planBadge} · {planPrice}</Badge>
			</div>
			<Separator />
			<div class="grid gap-4 md:grid-cols-2">
				<div class="grid gap-1">
					<p class="text-sm font-medium">Plan</p>
					<p class="text-sm text-muted-foreground">{billingStatus}</p>
					{#if isBillingEnabled}
						<div class="mt-1">
							<Button href={`/org/${data.orgUrlSegment}/billing`} size="sm">Manage Billing</Button>
						</div>
					{/if}
				</div>
				<div class="grid gap-1">
					<p class="text-sm font-medium">Personnel count</p>
					<p class="text-sm text-muted-foreground">{personnelCount}</p>
				</div>
			</div>
			{#if planUsageSummary}
				<Separator />
				<div class="grid gap-3">
					<div class="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
						<h3 class="font-heading text-base font-semibold tracking-tight">Plan Usage & Limits</h3>
						{#if planUsageSummary.alerts.length > 0}
							<Badge variant="warning">Action needed</Badge>
						{/if}
					</div>
					<div class="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
						{#each planUsageSummary.rows as row (row.dimension)}
							<div class="grid gap-1 rounded-md border bg-muted/30 p-3">
								<div class="flex items-start justify-between gap-2">
									<p class="text-sm font-medium">{row.label}</p>
									<Badge variant={usageStatusVariant(row.status)}>{usageStatusLabel(row.status)}</Badge>
								</div>
								<strong class="text-lg font-semibold tracking-tight">{row.used} / {row.limitLabel}</strong>
								<p class="text-xs text-muted-foreground">{row.message}</p>
								{#if row.status !== 'within_limit'}
									<p class="text-xs font-medium">{row.remediation}</p>
								{/if}
							</div>
						{/each}
					</div>
					{#if planUsageSummary.alerts.length > 0}
						<p class="text-sm font-medium">Existing data remains visible while limits are resolved.</p>
					{/if}
				</div>
			{/if}
		</section>
	</div>
{/if}
