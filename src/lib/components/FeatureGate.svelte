<script lang="ts">
	import { subscriptionStore } from '../stores/subscription.svelte';
	import UpgradePrompt from './UpgradePrompt.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		feature: 'dutyRoster' | 'bulkImport' | 'excelExport' | 'prioritySupport';
		showPrompt?: boolean;
		children: Snippet;
		fallback?: Snippet;
	}

	let { feature, showPrompt = true, children, fallback }: Props = $props();

	const hasAccess = $derived(subscriptionStore.hasFeature(feature));

	const featureNames: Record<string, string> = {
		dutyRoster: 'Duty Roster Generator',
		bulkImport: 'Bulk Import',
		excelExport: 'Excel Export',
		prioritySupport: 'Priority Support'
	};
</script>

{#if hasAccess}
	{@render children()}
{:else if showPrompt}
	<UpgradePrompt
		featureName={featureNames[feature]}
		requiredPlan="Pro"
	/>
{:else if fallback}
	{@render fallback()}
{/if}
