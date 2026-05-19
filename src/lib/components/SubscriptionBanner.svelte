<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import { isBillingEnabled } from '$lib/config/billing';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';

	let { orgId, orgUrlSegment = orgId }: { orgId: string; orgUrlSegment?: string } = $props();

	const daysRemaining = $derived(subscriptionStore.giftDaysRemaining);
	const showGiftWarning = $derived(subscriptionStore.isGifted && daysRemaining !== null && daysRemaining <= 14);
	const isUrgent = $derived(daysRemaining !== null && daysRemaining <= 3);
	const isReadOnly = $derived(subscriptionStore.isReadOnly);
	const showBanner = $derived(isBillingEnabled && (showGiftWarning || isReadOnly));

	const tierName = $derived(subscriptionStore.tierConfig.name);
	const personnelCap = $derived(subscriptionStore.personnelCap);
	const personnelCount = $derived(subscriptionStore.personnelCount);
</script>

{#if showBanner}
	<Alert.Root
		variant={isUrgent || isReadOnly ? 'destructive' : 'warning'}
		class="rounded-none border-x-0 border-t-0 px-0 py-0"
	>
		<div
			class="mx-auto flex w-full max-w-[1680px] flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap sm:items-center sm:px-6"
		>
			<span class="mt-1 h-auto w-0.5 self-stretch rounded-full bg-current opacity-70 sm:mt-0"></span>
			{#if isReadOnly}
				<CircleAlertIcon aria-hidden="true" class="mt-1 size-4 shrink-0 sm:mt-0" />
				<Alert.Description class="min-w-0 flex-1 text-sm leading-6 text-current">
					Your org has <strong>{personnelCount}</strong> personnel but your current plan allows
					<strong>{personnelCap === Infinity ? 'unlimited' : personnelCap}</strong>. Your data is read-only.
				</Alert.Description>
				<div class="flex flex-wrap items-center gap-2">
					<Button href="/org/{orgUrlSegment}/billing" variant="outline" size="xs">Subscribe</Button>
					<Button href="/org/{orgUrlSegment}/personnel" variant="outline" size="xs">Manage Personnel</Button>
					<Button href="/org/{orgUrlSegment}/settings" variant="outline" size="xs">Export Data</Button>
				</div>
			{:else if showGiftWarning}
				{#if isUrgent}
					<CircleAlertIcon aria-hidden="true" class="mt-1 size-4 shrink-0 sm:mt-0" />
				{:else}
					<ClockIcon aria-hidden="true" class="mt-1 size-4 shrink-0 sm:mt-0" />
				{/if}
				<Alert.Description class="min-w-0 flex-1 text-sm leading-6 text-current">
					{#if isUrgent}
						Your complimentary <strong>{tierName}</strong> plan expires in
						<strong>{daysRemaining}</strong>
						{daysRemaining === 1 ? 'day' : 'days'}. Subscribe now to maintain full access.
					{:else}
						Your complimentary <strong>{tierName}</strong> plan expires in
						<strong>{daysRemaining}</strong>
						{daysRemaining === 1 ? 'day' : 'days'}. Set up a subscription to keep your data.
					{/if}
				</Alert.Description>
				<div class="flex flex-wrap items-center gap-2">
					<Button href="/org/{orgUrlSegment}/billing" variant="outline" size="xs">Subscribe</Button>
				</div>
			{/if}
		</div>
	</Alert.Root>
{/if}
