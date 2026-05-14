<script lang="ts" module>
	export interface PrototypeVariant {
		key: string;
		label: string;
	}
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { onMount } from 'svelte';

	interface Props {
		variants: PrototypeVariant[];
		current: string;
		param?: string;
		ariaLabel?: string;
	}

	let { variants, current, param = 'variant', ariaLabel = 'Prototype variants' }: Props = $props();

	const isPrototypeSwitcherVisible = !import.meta.env.PROD;
	const currentIndex = $derived(
		Math.max(
			0,
			variants.findIndex((variant) => variant.key === current)
		)
	);
	const currentVariant = $derived(variants[currentIndex] ?? variants[0]);
	const previousHref = $derived(getHref(-1));
	const nextHref = $derived(getHref(1));

	function getHref(direction: -1 | 1) {
		if (!variants.length) return page.url.pathname;

		const nextIndex = (currentIndex + direction + variants.length) % variants.length;
		const url = new URL(page.url);
		url.searchParams.set(param, variants[nextIndex].key);

		return `${url.pathname}${url.search}${url.hash}`;
	}

	function go(direction: -1 | 1) {
		if (!variants.length) return;

		goto(getHref(direction), { replaceState: true, noScroll: true });
	}

	onMount(() => {
		if (!isPrototypeSwitcherVisible) return;

		function handleKeydown(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null;
			const tagName = target?.tagName;
			const isEditable =
				target?.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';

			if (isEditable) return;
			if (event.key === 'ArrowLeft') go(-1);
			if (event.key === 'ArrowRight') go(1);
		}

		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});
</script>

{#if isPrototypeSwitcherVisible && currentVariant}
	<div class="prototype-switcher" role="group" aria-label={ariaLabel}>
		<a href={previousHref} aria-label="Previous prototype variant">
			<ChevronLeftIcon size={18} strokeWidth={2.25} />
		</a>

		<div class="prototype-switcher__label" aria-live="polite">
			<span>{currentVariant.key}</span>
			{currentVariant.label}
		</div>

		<a href={nextHref} aria-label="Next prototype variant">
			<ChevronRightIcon size={18} strokeWidth={2.25} />
		</a>
	</div>
{/if}

<style>
	.prototype-switcher {
		position: fixed;
		inset-inline-start: 50%;
		bottom: 1.25rem;
		z-index: 2147483647;
		display: grid;
		grid-template-columns: 2.5rem minmax(13rem, auto) 2.5rem;
		align-items: center;
		transform: translateX(-50%);
		width: max-content;
		max-width: calc(100vw - 1.5rem);
		border: 1px solid rgb(255 255 255 / 0.18);
		border-radius: 999px;
		background: rgb(12 15 14 / 0.94);
		box-shadow: 0 18px 50px rgb(0 0 0 / 0.28);
		color: white;
		font-family: 'IBM Plex Mono', monospace;
	}

	.prototype-switcher a {
		display: inline-grid;
		width: 2.5rem;
		height: 2.5rem;
		place-items: center;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: white;
		cursor: pointer;
	}

	.prototype-switcher a:hover {
		background: rgb(255 255 255 / 0.1);
	}

	.prototype-switcher a:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.prototype-switcher__label {
		padding-inline: 0.35rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-align: center;
		white-space: nowrap;
	}

	.prototype-switcher__label span {
		color: var(--accent);
		margin-right: 0.5rem;
	}

	@media (max-width: 540px) {
		.prototype-switcher {
			width: min(calc(100vw - 1.5rem), 24rem);
			grid-template-columns: 2.5rem minmax(0, 1fr) 2.5rem;
		}

		.prototype-switcher__label {
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}
</style>
