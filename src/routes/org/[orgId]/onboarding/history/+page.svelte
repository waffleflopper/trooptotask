<script lang="ts">
	import { OnboardingHistoryPage } from '$features/onboarding';
	import { getAppShellContext } from '$features/app-shell';

	let { data } = $props();
	const org = getAppShellContext();
</script>

<OnboardingHistoryPage orgUrlSegment={data.shell.org.urlSegment} orgId={org.orgId} scopeSet={org.scopeSet} />
