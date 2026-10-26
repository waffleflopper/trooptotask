<script lang="ts">
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils';
	import { monoLabel, pageGutter } from './layout';

	interface Props {
		active?: 'about' | 'security';
	}

	let { active }: Props = $props();

	const links = $derived([
		{ label: 'Platform', href: resolve('/#platform'), narrowOnly: true, current: false },
		{ label: "What's next", href: resolve('/#whats-next'), narrowOnly: true, current: false },
		{ label: 'FAQ', href: resolve('/#faq'), narrowOnly: true, current: false },
		{ label: 'About', href: resolve('/about'), narrowOnly: false, current: active === 'about' },
		{ label: 'Security', href: resolve('/security'), narrowOnly: false, current: active === 'security' },
		{ label: 'Privacy', href: resolve('/privacy'), narrowOnly: false, current: false },
		{ label: 'Terms', href: resolve('/terms'), narrowOnly: false, current: false }
	]);
</script>

<footer class="bg-chrome">
	<div class={pageGutter}>
		<div
			class="flex flex-col gap-6 border-t border-chrome-border py-8 lg:h-20 lg:flex-row lg:items-center lg:justify-between lg:py-0"
		>
			<span class="font-heading text-lg leading-[22px] font-bold tracking-[0.02em] text-chrome-text uppercase"
				>TroopToTask</span
			>
			<nav aria-label="Footer">
				<ul class="m-0 flex list-none flex-wrap gap-x-8 gap-y-3 p-0">
					{#each links as link (link.label)}
						<li class={cn(link.narrowOnly && 'min-[900px]:hidden')}>
							<a
								href={link.href}
								aria-current={link.current ? 'page' : undefined}
								class={cn(
									monoLabel,
									'no-underline transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-chrome-accent',
									link.current ? 'text-chrome-accent' : 'text-chrome-text-muted hover:text-chrome-text'
								)}>{link.label}</a
							>
						</li>
					{/each}
				</ul>
			</nav>
			<p class={cn(monoLabel, 'm-0 text-chrome-text-muted')}>Not for classified information</p>
		</div>
	</div>
</footer>
