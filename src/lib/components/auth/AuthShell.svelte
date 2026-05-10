<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { Button } from '$lib/components/ui/button';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { cn } from '$lib/utils';

	interface Props {
		eyebrow?: string;
		title: string;
		description?: string;
		panelEyebrow?: string;
		panelTitle?: string;
		panelDescription?: string;
		imageSrc?: string;
		imageAlt?: string;
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
		imageSrc,
		imageAlt = '',
		supportLabel = 'Account Help',
		supportTitle = 'Use the path that fits your account.',
		supportDescription = 'Sign in, recover access, or complete an invite from the links on this page.',
		supportPoints = defaultSupportPoints,
		children,
		aside
	}: Props = $props();

	const resolvedPanelTitle = $derived(panelTitle ?? title);
	const resolvedImageSrc = $derived(imageSrc ?? null);
	const hasImage = $derived(!!resolvedImageSrc);
</script>

<div class="min-h-screen overflow-x-hidden overflow-y-auto bg-muted/25 text-foreground">
	<div class="mx-auto flex min-h-screen max-w-[1120px] flex-col px-4 py-5 sm:px-6 lg:px-8">
		<header class="flex items-center justify-between gap-4">
			<a
				href={resolve('/')}
				class="inline-flex flex-col gap-0.5 text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<span
					class="[font-family:var(--font-display)] text-xl leading-none font-extrabold tracking-[0.03em] uppercase sm:text-2xl"
				>
					Troop<span class="text-primary">To</span>Task
				</span>
				<span class="font-mono text-[0.625rem] font-medium tracking-[0.14em] text-muted-foreground uppercase">
					Unit Readiness Platform
				</span>
			</a>

			<div class="flex items-center gap-2">
				<Button href={resolve('/')} variant="outline" size="sm">Back to site</Button>
				<Button
					variant="outline"
					size="icon-sm"
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

		<main class="flex flex-1 items-center justify-center py-8 md:py-12">
			<section
				class={cn(
					'grid w-full overflow-hidden rounded-xl border border-border/80 bg-card text-card-foreground shadow-[0_16px_48px_-36px_oklch(0.147_0.004_49.25/0.55),0_1px_2px_oklch(0.147_0.004_49.25/0.08)]',
					hasImage ? 'max-w-[960px] md:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]' : 'max-w-[480px]'
				)}
				aria-labelledby="auth-panel-title"
			>
				<div class="flex flex-col px-6 py-7 sm:px-8 sm:py-9">
					{#if panelEyebrow ?? eyebrow}
						<p class="font-mono text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
							{panelEyebrow ?? eyebrow}
						</p>
					{/if}

					<h1
						id="auth-panel-title"
						class="mt-4 text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl"
					>
						{resolvedPanelTitle}
					</h1>

					{#if panelDescription ?? description}
						<p class="mt-2 text-sm leading-6 text-muted-foreground">{panelDescription ?? description}</p>
					{/if}

					<div class="mt-6 flex flex-col gap-5">
						{@render children()}
					</div>

					{#if !hasImage && supportPoints.length > 0}
						<div class="mt-6 rounded-lg border bg-muted/35 p-4">
							<p class="text-sm font-medium text-foreground">{supportTitle}</p>
							<ul class="mt-3 grid gap-2">
								{#each supportPoints as point, index (`${point}:${index}`)}
									<li class="grid grid-cols-[auto_1fr] items-start gap-2 text-sm leading-5 text-muted-foreground">
										<span class="mt-2 size-1.5 rounded-full bg-primary" aria-hidden="true"></span>
										<span>{point}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					{#if aside}
						<div class="mt-5">
							{@render aside()}
						</div>
					{/if}
				</div>

				{#if resolvedImageSrc}
					<div class="relative hidden min-h-[520px] overflow-hidden border-l border-border/80 bg-muted md:block">
						<img src={resolvedImageSrc} alt={imageAlt} class="absolute inset-0 size-full object-cover" />
						<div class="absolute inset-0 bg-gradient-to-t from-background/55 via-transparent to-transparent"></div>
						<div
							class="absolute right-5 bottom-5 left-5 rounded-lg border border-border/80 bg-background/88 p-4 shadow-[0_10px_30px_-24px_oklch(0.147_0.004_49.25/0.45),0_1px_2px_oklch(0.147_0.004_49.25/0.08)] backdrop-blur-sm"
						>
							<p class="font-mono text-[0.625rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
								{supportLabel}
							</p>
							<p class="mt-1 text-sm font-medium text-foreground">{supportTitle}</p>
							<p class="mt-1 text-xs leading-5 text-muted-foreground">{supportDescription}</p>
						</div>
					</div>
				{/if}
			</section>
		</main>

		<footer class="pb-6 text-center text-sm leading-6 text-muted-foreground">
			By continuing, you agree to our <a href={resolve('/terms')}>Terms of Use</a> and
			<a href={resolve('/privacy')}>Privacy Policy</a>.
		</footer>
	</div>
</div>
