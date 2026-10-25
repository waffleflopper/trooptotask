<script lang="ts">
	import { page } from '$app/state';
	import AdminPage from '$features/platform-admin/components/AdminPage.svelte';
	import AdminPageHeader from '$features/platform-admin/components/AdminPageHeader.svelte';
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

<AdminPage>
	<AdminPageHeader
		eyebrow="Platform · Communication"
		title="Announcements"
		description="Banners every signed-in user sees, and the What's New entries."
	/>
	<PageShell.Tabs label="Announcement sections" {items} />
	{@render children()}
</AdminPage>
