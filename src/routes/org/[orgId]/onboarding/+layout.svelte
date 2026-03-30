<script lang="ts">
	import { page } from '$app/stores';
	import { applyHydration } from '$lib/applyHydration.svelte';
	import { onboardingTemplateStore } from '$features/onboarding/stores/onboardingTemplate.svelte';
	import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';

	let { children, data } = $props();

	$effect(() => {
		applyHydration(data.onboarding.hydration);

		const orgId = $page.params.orgId!;
		onboardingTemplateStore.load(
			data.onboarding.data.onboardingTemplates,
			data.onboarding.data.onboardingTemplateSteps,
			orgId
		);
		onboardingStore.load(data.onboarding.data.onboardings, orgId);
	});
</script>

{@render children()}
