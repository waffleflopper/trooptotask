<script lang="ts">
	import { createOnboardingPageContext } from '$features/onboarding/contexts/OnboardingPageContext.svelte';
	import OnboardingPageView from '$features/onboarding/components/OnboardingPageView.svelte';
	import OnboardingModals from '$features/onboarding/components/OnboardingModals.svelte';

	let { data } = $props();

	const ctx = createOnboardingPageContext({
		isOwner: data.isOwner ?? false,
		isAdmin: data.isAdmin ?? false,
		isFullEditor: data.isFullEditor ?? false,
		permissions: data.permissions ?? null
	});
</script>

<OnboardingPageView {ctx} />
<OnboardingModals {ctx} />
