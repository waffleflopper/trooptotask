<script lang="ts">
	import type { Snippet } from 'svelte';
	import PublicCta from './PublicCta.svelte';
	import PublicFooter from './PublicFooter.svelte';
	import PublicSiteNav from './PublicSiteNav.svelte';

	interface Props {
		user?: unknown;
		active?: 'about' | 'security';
		bodyClass?: string;
		showFaqLink?: boolean;
		showClassificationBar?: boolean;
		showCta?: boolean;
		navOverlay?: boolean;
		navScrolled?: boolean;
		children: Snippet;
	}

	let {
		user,
		active,
		bodyClass = '',
		showFaqLink = false,
		showClassificationBar = true,
		showCta = true,
		navOverlay = false,
		navScrolled = false,
		children
	}: Props = $props();
</script>

<div class="min-h-screen overflow-x-hidden bg-background font-body text-base leading-[1.65] font-light text-foreground">
	{#if showClassificationBar}
		<div
			class="border-b border-border bg-muted px-4 py-1.5 text-center font-mono text-[0.6875rem] leading-[1.4] font-medium tracking-[0.15em] text-muted-foreground uppercase max-sm:px-3 max-sm:text-[0.6rem] dark:border-chrome-border dark:bg-foreground dark:text-chrome-text-muted"
		>
			<span>TROOP TO TASK</span>
			<span class="mx-3 text-accent">//</span>
			<span>PERSONNEL MANAGEMENT SYSTEM</span>
		</div>
	{/if}

	<PublicSiteNav {user} {active} {showFaqLink} overlay={navOverlay} scrolled={navScrolled} />

	<main class={bodyClass || undefined}>
		{@render children()}
	</main>

	{#if showCta}
		<PublicCta {user} />
	{/if}

	<PublicFooter />
</div>
