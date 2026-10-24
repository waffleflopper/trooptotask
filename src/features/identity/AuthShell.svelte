<script module lang="ts">
	export type AuthStep = {
		title: string;
		detail: string;
		state?: 'done' | 'current' | 'upcoming' | 'flagged';
	};

	export type AuthAlternative = { prompt: string; label: string } & (
		| { href: string }
		| { signOut: true }
		| { onclick: () => void }
	);
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { cn } from '$lib/utils';

	interface Props {
		eyebrow: string;
		headline: [string, string];
		lede: string;
		steps?: { label: string; items: AuthStep[] };
		panelEyebrow: string;
		panelTitle: string;
		panelDescription?: string;
		alternatives?: AuthAlternative[];
		children: Snippet;
	}

	let {
		eyebrow,
		headline,
		lede,
		steps,
		panelEyebrow,
		panelTitle,
		panelDescription,
		alternatives = [],
		children
	}: Props = $props();

	const stepTone = {
		default: { numeral: 'text-accent', title: 'text-chrome-text', detail: 'text-chrome-text-muted' },
		done: { numeral: 'text-success', title: 'text-chrome-text-muted', detail: 'text-chrome-text-muted' },
		current: { numeral: 'text-accent', title: 'text-chrome-text', detail: 'text-accent' },
		upcoming: { numeral: 'text-chrome-text-muted', title: 'text-chrome-text-muted', detail: 'text-chrome-text-muted' },
		flagged: { numeral: 'text-accent', title: 'text-accent', detail: 'text-chrome-text' }
	} as const;

	const footerLinks = [
		{ label: 'Privacy', href: resolve('/privacy') },
		{ label: 'Terms', href: resolve('/terms') },
		{ label: 'Security', href: resolve('/security') }
	];

	const chromeLabel = 'font-mono text-[11px] leading-[14px] tracking-[0.12em] text-chrome-text-muted uppercase';
	const altLink =
		'font-body text-sm leading-5 text-foreground underline decoration-1 underline-offset-[3px] hover:decoration-2';
</script>

<div
	class="min-h-dvh bg-background font-body text-foreground lg:grid lg:grid-cols-[minmax(0,min(600px,42vw))_minmax(0,1fr)] lg:grid-rows-[1fr_auto]"
>
	<header
		class="flex flex-col bg-chrome px-6 pt-6 pb-10 text-chrome-text sm:px-10 lg:col-start-1 lg:row-start-1 lg:border-r lg:border-chrome-border lg:px-12 lg:pt-10 lg:pb-10 xl:px-16"
	>
		<div class="flex items-center justify-between gap-4">
			<p class="font-heading text-xl leading-7 font-bold tracking-[0.02em] uppercase">TroopToTask</p>
			<a
				href={resolve('/')}
				class="font-mono text-xs leading-4 tracking-[0.12em] text-chrome-text-muted uppercase hover:text-chrome-text"
			>
				<span aria-hidden="true">←</span> TroopToTask.com
			</a>
		</div>

		<div class="mt-10 flex flex-col gap-4 lg:my-auto lg:gap-6 lg:py-12">
			<p class="font-mono text-[13px] leading-4 tracking-[0.14em] text-accent uppercase">{eyebrow}</p>
			<p
				class="font-heading text-[44px] leading-[42px] font-bold tracking-[-0.005em] uppercase lg:text-[52px] lg:leading-[50px] xl:text-[64px] xl:leading-[60px] min-[87.5rem]:text-[72px] min-[87.5rem]:leading-[68px]"
			>
				<span class="block">{headline[0]}</span>
				<span class="block text-accent">{headline[1]}</span>
			</p>
			<p class="max-w-[420px] text-base leading-6 font-light text-chrome-text-muted lg:text-lg lg:leading-7">{lede}</p>
		</div>
	</header>

	<main
		class="flex justify-center px-6 py-10 sm:px-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:items-center lg:px-12 lg:py-12 xl:px-20"
		aria-labelledby="auth-panel-title"
	>
		<div class="flex w-full max-w-[400px] flex-col gap-8">
			<div class="flex flex-col gap-2.5 border-b-2 border-foreground pb-5">
				<p class="font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
					{panelEyebrow}
				</p>
				<h1
					id="auth-panel-title"
					class="font-heading text-[40px] leading-[40px] font-extrabold text-balance uppercase sm:text-[44px] sm:leading-[44px]"
				>
					{panelTitle}
				</h1>
				{#if panelDescription}
					<p class="text-[15px] leading-[22px] text-muted-foreground">{panelDescription}</p>
				{/if}
			</div>

			{@render children()}

			{#if alternatives.length > 0}
				<div class="flex flex-col gap-2.5 border-t border-border pt-5">
					{#each alternatives as alternative (alternative.label)}
						<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm leading-5">
							<span class="text-muted-foreground">{alternative.prompt}</span>
							{#if 'href' in alternative}
								<a href={alternative.href} class={altLink}>{alternative.label}</a>
							{:else if 'onclick' in alternative}
								<button type="button" class={cn(altLink, 'cursor-pointer')} onclick={alternative.onclick}>
									{alternative.label}
								</button>
							{:else}
								<form method="POST" action={resolve('/auth/logout')}>
									<button type="submit" class={cn(altLink, 'cursor-pointer')}>{alternative.label}</button>
								</form>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</main>

	<footer
		class="border-t border-chrome-border bg-chrome px-6 pt-8 pb-10 text-chrome-text sm:px-10 lg:col-start-1 lg:row-start-2 lg:border-t-0 lg:border-r lg:px-12 lg:pt-0 lg:pb-12 xl:px-16"
	>
		{#if steps}
			<section aria-labelledby="auth-steps-label">
				<h2 id="auth-steps-label" class={cn(chromeLabel, 'border-b border-chrome-border pb-3')}>{steps.label}</h2>
				<ol>
					{#each steps.items as step, index (step.title)}
						{@const tone = stepTone[step.state ?? 'default']}
						<li
							class="flex items-baseline gap-4 border-b border-chrome-border py-3.5"
							aria-current={step.state === 'current' ? 'step' : undefined}
						>
							<span class={cn('w-7 shrink-0 font-mono text-xs leading-4', tone.numeral)}>
								{#if step.state === 'done'}
									<CheckIcon class="inline size-3.5 align-[-2px]" strokeWidth={2.5} aria-hidden="true" />
									<span class="sr-only">Done:</span>
								{:else}
									{String(index + 1).padStart(2, '0')}
								{/if}
							</span>
							<span class="flex min-w-0 grow flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
								<span class={cn('shrink-0 text-[15px] leading-5 sm:w-[196px] lg:w-[150px] xl:w-[196px]', tone.title)}>
									{step.title}
								</span>
								<span class={cn('text-sm leading-5', tone.detail)}>{step.detail}</span>
							</span>
						</li>
					{/each}
				</ol>
			</section>
		{:else}
			<nav aria-label="Legal" class="flex gap-6 border-t border-chrome-border pt-4">
				{#each footerLinks as link (link.href)}
					<a href={link.href} class={cn(chromeLabel, 'hover:text-chrome-text')}>{link.label}</a>
				{/each}
			</nav>
		{/if}
	</footer>
</div>
