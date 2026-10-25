<script lang="ts">
	import { page } from '$app/state';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const items = $derived([
		{
			label: 'Banners',
			href: '/admin/announcements' as const,
			active: page.url.pathname === '/admin/announcements'
		},
		{
			label: "What's New",
			href: '/admin/announcements/whats-new' as const,
			active: page.url.pathname.startsWith('/admin/announcements/whats-new')
		}
	]);
</script>

<PageShell.Root width="content" density="compact">
	<PageShell.Header
		title="Announcements"
		subtitle="Banners every signed-in account sees, and the updates in What's New."
	/>
	<PageShell.Tabs label="Announcement sections" {items} />
	{@render children()}
</PageShell.Root>
