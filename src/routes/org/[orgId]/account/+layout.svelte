<script lang="ts">
	import { page } from '$app/state';
	import { getAppShellContext } from '$features/app-shell';
	import { AccountShell } from '$features/identity';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	const shell = getAppShellContext();
</script>

<AccountShell
	baseHref={`/org/${shell.orgUrlSegment}/account`}
	activePath={page.url.pathname}
	onwhatsnew={shell.openWhatsNew}
	onfeedback={shell.openFeedback}
	{children}
/>
