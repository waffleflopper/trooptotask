<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AccountShell from '$features/identity/AccountShell.svelte';
	import { BrandWordmark } from '$lib/components/patterns/brand-wordmark';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<header class="flex h-14 shrink-0 items-center border-b border-border bg-background px-4 md:px-6">
	<a href={resolve('/dashboard')} class="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
		<BrandWordmark hideSubtitleOnMobile />
		<span class="sr-only">Your units</span>
	</a>
</header>
<main id="main-content" tabindex="-1" class="flex min-h-0 flex-1 flex-col outline-none">
	<AccountShell baseHref="/account" activePath={page.url.pathname} {children} />
</main>
