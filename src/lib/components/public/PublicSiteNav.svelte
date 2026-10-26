<script lang="ts">
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils';
	import PublicButton from './PublicButton.svelte';
	import { monoLabel, pageGutter } from './layout';

	interface Props {
		signedIn?: boolean;
		active?: 'about' | 'security';
	}

	let { signedIn = false, active }: Props = $props();

	const links = $derived([
		{ label: 'Platform', href: resolve('/#platform'), current: false },
		{ label: "What's next", href: resolve('/#whats-next'), current: false },
		{ label: 'Security', href: resolve('/security'), current: active === 'security' },
		{ label: 'FAQ', href: resolve('/#faq'), current: false },
		{ label: 'About', href: resolve('/about'), current: active === 'about' }
	]);

	const linkClass =
		'no-underline transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-chrome-accent max-sm:text-xs max-sm:tracking-[0.08em]';
</script>

<nav aria-label="Primary" class="sticky top-0 z-100 bg-chrome">
	<div class={pageGutter}>
		<div class="flex h-20 items-center justify-between gap-4 border-b border-chrome-border sm:gap-6">
			<div class="flex items-center gap-14">
				<a
					href={resolve('/')}
					class="font-heading text-lg leading-[22px] font-bold tracking-[0.02em] text-chrome-text uppercase no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-chrome-accent"
					>TroopToTask</a
				>
				<ul class="m-0 flex list-none gap-6 p-0 max-[900px]:hidden xl:gap-8">
					{#each links as link (link.label)}
						<li class="flex">
							<a
								href={link.href}
								aria-current={link.current ? 'page' : undefined}
								class={cn(
									monoLabel,
									linkClass,
									link.current ? 'text-chrome-accent' : 'text-chrome-text-muted hover:text-chrome-text'
								)}>{link.label}</a
							>
						</li>
					{/each}
				</ul>
			</div>

			<div class="flex shrink-0 items-center gap-4 sm:gap-6">
				{#if signedIn}
					<PublicButton href={resolve('/dashboard?show=all')} size="sm">Dashboard</PublicButton>
				{:else}
					<a href={resolve('/auth/login')} class={cn(monoLabel, linkClass, 'text-chrome-text hover:text-chrome-accent')}
						>Sign In</a
					>
					<PublicButton href={resolve('/auth/request-access')} size="sm">Request Access</PublicButton>
				{/if}
			</div>
		</div>
	</div>
</nav>
