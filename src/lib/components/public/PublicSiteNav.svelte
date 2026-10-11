<script lang="ts">
	import { resolve } from '$app/paths';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { BrandWordmark } from '$lib/components/patterns/brand-wordmark';
	import { Button } from '$lib/components/ui/button';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { cn } from '$lib/utils';

	interface Props {
		user?: unknown;
		active?: 'about' | 'security';
		showFaqLink?: boolean;
		overlay?: boolean;
		scrolled?: boolean;
	}

	let { user, active, showFaqLink = false, overlay = false, scrolled = false }: Props = $props();

	// The nav is paper by default and floats over the dark hero until the page scrolls past it.
	const tones = {
		paper: {
			bar: 'border-border bg-background',
			text: 'text-foreground',
			muted: 'text-muted-foreground',
			toggle: 'text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted',
			outline: 'border-border text-foreground hover:border-muted-foreground hover:bg-muted dark:hover:bg-muted'
		},
		chrome: {
			bar: 'border-transparent bg-chrome-overlay',
			text: 'text-chrome-text',
			muted: 'text-chrome-text-muted',
			toggle: 'text-chrome-text-muted hover:bg-chrome-hover hover:text-chrome-text dark:hover:bg-chrome-hover',
			outline:
				'border-chrome-border-subtle text-chrome-text hover:border-chrome-text-muted hover:bg-chrome-hover hover:text-chrome-text dark:hover:bg-chrome-hover'
		}
	} as const;

	const floating = $derived(overlay && !scrolled);
	const tone = $derived(tones[floating ? 'chrome' : 'paper']);
	const actionClass =
		'rounded-md px-4 py-[0.45rem] font-heading text-[14px] leading-none font-semibold tracking-[0.04em] max-sm:px-3';
</script>

<nav
	class={cn(
		'top-0 z-100 border-b transition-[background-color,border-color,box-shadow] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]',
		overlay ? 'fixed right-0 left-0' : 'sticky',
		tone.bar,
		floating && 'backdrop-blur-md',
		overlay && scrolled && 'shadow-[0_1px_3px] shadow-chrome-shadow'
	)}
>
	<div class="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-8 px-8 max-sm:gap-4 max-sm:px-4">
		<a
			href={resolve('/')}
			class={cn(
				'flex shrink-0 items-baseline no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
				tone.text
			)}
		>
			<BrandWordmark hideSubtitleOnMobile variant={floating ? 'on-chrome' : 'default'} />
		</a>

		<div class="flex flex-1 items-center justify-center gap-8 max-[900px]:hidden">
			{@render navLink('/about', 'About', active === 'about')}
			{@render navLink('/security', 'Security', active === 'security')}
			{#if showFaqLink}
				{@render navLink('/#faq', 'FAQ', false)}
			{/if}
		</div>

		<div class="flex shrink-0 items-center gap-3">
			<Button
				variant="ghost"
				size="icon"
				type="button"
				onclick={() => themeStore.toggle()}
				aria-label="Toggle theme"
				class={cn('size-9 max-sm:size-[34px]', tone.toggle)}
			>
				{#if themeStore.isDark}
					<SunIcon aria-hidden="true" />
				{:else}
					<MoonIcon aria-hidden="true" />
				{/if}
			</Button>
			{#if user}
				<Button href={resolve('/dashboard?show=all')} variant="ghost" size="none" class={cn(actionClass, tone.outline)}
					>Dashboard</Button
				>
			{:else}
				<Button href={resolve('/auth/login')} variant="ghost" size="none" class={cn(actionClass, tone.outline)}
					>Sign In</Button
				>
				<Button href={resolve('/auth/request-access')} variant="accent" size="none" class={actionClass}
					>Request Access</Button
				>
			{/if}
		</div>
	</div>
</nav>

{#snippet navLink(route: '/about' | '/security' | '/#faq', label: string, current: boolean)}
	<a
		href={resolve(route)}
		aria-current={current ? 'page' : undefined}
		class={cn(
			'border-b-2 py-2 font-heading text-[1rem] font-medium tracking-[0.04em] no-underline transition-colors duration-[120ms] hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
			tone.muted,
			floating ? 'hover:text-chrome-text' : 'hover:text-foreground',
			current ? ['border-accent', tone.text] : 'border-transparent'
		)}
	>
		{label}
	</a>
{/snippet}
