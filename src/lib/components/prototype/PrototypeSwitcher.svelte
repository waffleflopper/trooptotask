<script lang="ts">
	import { dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { Button } from '$lib/components/ui/button/index.js';

	interface PrototypeVariant {
		key: string;
		name: string;
	}

	interface Props {
		variants: PrototypeVariant[];
		current: string;
	}

	let { variants, current }: Props = $props();

	const currentIndex = $derived(
		Math.max(
			0,
			variants.findIndex((variant) => variant.key === current)
		)
	);
	const currentVariant = $derived(variants[currentIndex] ?? variants[0]);

	function targetVariant(offset: number): PrototypeVariant | undefined {
		if (variants.length === 0) return undefined;
		const nextIndex = (currentIndex + offset + variants.length) % variants.length;
		return variants[nextIndex] ?? variants[0];
	}

	function setVariant(variant: PrototypeVariant | undefined) {
		if (!variant) return;
		const url = new URL(page.url);
		url.searchParams.set('variant', variant.key);
		void goto(resolve(`${url.pathname}${url.search}` as '/'), { replaceState: true, noScroll: true, keepFocus: true });
	}

	function isTextInput(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (isTextInput(event.target)) return;
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			setVariant(targetVariant(-1));
		}
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			setVariant(targetVariant(1));
		}
	}
</script>

<svelte:window onkeydown={dev ? handleKeydown : undefined} />

{#if dev && currentVariant}
	<nav
		class="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background/95 px-2 py-2 shadow-lg backdrop-blur"
		aria-label="Prototype variants"
	>
		<Button
			variant="outline"
			size="icon-sm"
			aria-label="Previous prototype variant"
			onclick={() => setVariant(targetVariant(-1))}
		>
			<ChevronLeft />
		</Button>
		<div class="min-w-48 px-2 text-center">
			<p class="text-xs font-medium leading-tight">{currentVariant.key} - {currentVariant.name}</p>
			<p class="text-[10px] text-muted-foreground">Prototype only</p>
		</div>
		<Button
			variant="outline"
			size="icon-sm"
			aria-label="Next prototype variant"
			onclick={() => setVariant(targetVariant(1))}
		>
			<ChevronRight />
		</Button>
	</nav>
{/if}
