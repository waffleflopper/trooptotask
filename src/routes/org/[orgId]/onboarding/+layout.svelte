<script lang="ts">
	import { page } from '$app/stores';
	import { applyHydration } from '$lib/applyHydration.svelte';
	import { onboardingTemplateStore } from '$features/onboarding/stores/onboardingTemplate.svelte';
	import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';

	let { children, data } = $props();

	// Guard against parent-only invalidation clobbering optimistic store mutations.
	// See calendar/+layout.svelte for full explanation.
	let lastRefs: unknown[] = [];

	$effect(() => {
		applyHydration(data.onboarding.hydration);

		const refs = [
			data.onboarding.data.onboardingTemplates,
			data.onboarding.data.onboardingTemplateSteps,
			data.onboarding.data.onboardings
		];

		const unchanged = refs.length === lastRefs.length && refs.every((r, i) => r === lastRefs[i]);
		if (unchanged) return;
		lastRefs = refs;

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
