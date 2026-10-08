<script lang="ts">
	import { OnboardingHistoryPage } from '$features/onboarding';
	import { getAppShellContext } from '$features/app-shell';

	let { data } = $props();
	const org = getAppShellContext();
</script>

<OnboardingHistoryPage
	orgUrlSegment={data.shell.org.urlSegment}
	scopeSet={org.scopeSet}
	onboardings={data.history.onboardings}
	personnel={data.history.personnel}
	templates={data.history.templates}
/>
