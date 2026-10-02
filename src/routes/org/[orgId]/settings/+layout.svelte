<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';
	import { SettingsShell } from '$features/organization';
	let { children, data }: LayoutProps = $props();
</script>

<SettingsShell
	settingsShell={data.settingsShell}
	orgUrlSegment={page.params.orgId ?? ''}
	activePath={page.url.pathname}
	{children}
/>
