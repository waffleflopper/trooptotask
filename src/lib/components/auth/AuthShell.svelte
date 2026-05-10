<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { themeStore } from '$lib/stores/theme.svelte';

	interface Props {
		eyebrow?: string;
		title: string;
		description?: string;
		panelEyebrow?: string;
		panelTitle?: string;
		panelDescription?: string;
		supportLabel?: string;
		supportTitle?: string;
		supportDescription?: string;
		supportPoints?: string[];
		children: Snippet;
		aside?: Snippet;
	}

	const defaultSupportPoints: string[] = [];

	let {
		eyebrow = 'Account Access',
		title,
		description,
		panelEyebrow,
		panelTitle,
		panelDescription,
		supportLabel = 'Account Help',
		supportTitle = 'Use the path that fits your account.',
		supportDescription = 'Sign in, recover access, or complete an invite from the links on this page.',
		supportPoints = defaultSupportPoints,
		children,
		aside
	}: Props = $props();

	const resolvedPanelTitle = $derived(panelTitle ?? title);
</script>

<div class="min-h-screen overflow-x-hidden overflow-y-auto bg-background text-foreground">
	<div class="mx-auto flex min-h-screen max-w-[1240px] flex-col px-4 py-5 sm:px-6 lg:px-8">
		<header class="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
			<a
				href={resolve('/')}
				class="inline-flex flex-col gap-0.5 text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<span
					class="[font-family:var(--font-display)] text-2xl leading-none font-extrabold tracking-[0.03em] uppercase sm:text-3xl"
				>
					Troop<span class="text-primary">To</span>Task
				</span>
				<span class="font-mono text-[0.6875rem] font-medium tracking-[0.14em] text-muted-foreground uppercase">
					Unit Readiness Platform
				</span>
			</a>

			<div class="flex items-center gap-3 max-sm:w-full max-sm:justify-between">
				<Button href={resolve('/')} variant="outline" class="max-sm:flex-1">Back to site</Button>
				<Button
					variant="outline"
					size="icon"
					type="button"
					onclick={() => themeStore.toggle()}
					aria-label="Toggle theme"
				>
					{#if themeStore.isDark}
						<SunIcon aria-hidden="true" />
					{:else}
						<MoonIcon aria-hidden="true" />
					{/if}
				</Button>
			</div>
		</header>

		<main
			class="grid flex-1 grid-cols-[minmax(0,1fr)_minmax(340px,470px)] items-center gap-10 py-10 md:py-16 lg:gap-16 max-[920px]:grid-cols-1 max-sm:py-5"
		>
			<section class="max-w-160 max-sm:hidden" aria-labelledby="auth-shell-intro-title">
				<p class="mb-3 font-mono text-[0.6875rem] font-semibold tracking-[0.15em] text-warning uppercase">{eyebrow}</p>
				<h1
					id="auth-shell-intro-title"
					class="max-w-[10ch] [font-family:var(--font-display)] text-5xl leading-[0.95] font-extrabold tracking-[0.04em] text-balance uppercase md:text-6xl lg:text-[5.75rem]"
				>
					{title}
				</h1>
				{#if description}
					<p class="mt-5 max-w-[34rem] text-lg leading-relaxed text-muted-foreground">{description}</p>
				{/if}

				<div class="mt-8 max-w-[32rem] border-t border-border/70 pt-5">
					<p class="font-mono text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
						{supportLabel}
					</p>
					<h2
						class="mt-3 [font-family:var(--font-display)] text-3xl leading-tight font-bold tracking-[0.05em] uppercase"
					>
						{supportTitle}
					</h2>
					<p class="mt-3 text-sm leading-relaxed text-muted-foreground">{supportDescription}</p>

					{#if supportPoints.length > 0}
						<ul class="mt-5 grid gap-3">
							{#each supportPoints as point, index (`${point}:${index}`)}
								<li class="grid grid-cols-[auto_1fr] items-start gap-3 text-sm leading-relaxed text-muted-foreground">
									<span class="mt-1.5 size-2.5 rounded-full bg-primary" aria-hidden="true"></span>
									<span>{point}</span>
								</li>
							{/each}
						</ul>
					{/if}

					{#if aside}
						<div class="mt-5">
							{@render aside()}
						</div>
					{/if}
				</div>
			</section>

			<section
				class="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm"
				aria-labelledby="auth-panel-title"
			>
				<header class="border-b bg-muted/35 px-6 py-5 max-sm:px-4">
					{#if panelEyebrow}
						<p class="font-mono text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
							{panelEyebrow}
						</p>
					{/if}
					<h2
						id="auth-panel-title"
						class="mt-3 [font-family:var(--font-display)] text-3xl leading-tight font-bold tracking-[0.06em] uppercase"
					>
						{resolvedPanelTitle}
					</h2>
					{#if panelDescription}
						<p class="mt-3 text-sm leading-relaxed text-muted-foreground">{panelDescription}</p>
					{/if}
				</header>

				<div class="flex flex-col gap-5 px-6 py-6 max-sm:px-4">
					{@render children()}
				</div>
			</section>
		</main>

		<Separator />
		<footer
			class="py-6 text-center font-mono text-[0.6875rem] font-medium tracking-[0.14em] text-muted-foreground uppercase sm:text-left"
		>
			Built for Army leaders, by Army leaders.
		</footer>
	</div>
</div>
