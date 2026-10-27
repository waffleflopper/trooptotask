<script lang="ts">
	import type { Snippet } from 'svelte';
	import PublicCta from './PublicCta.svelte';
	import PublicFooter from './PublicFooter.svelte';
	import PublicSiteNav from './PublicSiteNav.svelte';

	interface Props {
		signedIn?: boolean;
		active?: 'about' | 'security';
		showCta?: boolean;
		children: Snippet;
	}

	let { signedIn = false, active, showCta = true, children }: Props = $props();
</script>

<!-- Public pages render the same light and dark bands whatever theme the app stored. -->
<div
	data-theme="light"
	class="relative min-h-screen overflow-x-hidden bg-background font-body text-base leading-[1.65] font-light text-foreground"
>
	<PublicSiteNav {signedIn} {active} />

	<main>
		{@render children()}
	</main>

	{#if showCta}
		<PublicCta {signedIn} />
	{/if}

	<PublicFooter {active} />
</div>
