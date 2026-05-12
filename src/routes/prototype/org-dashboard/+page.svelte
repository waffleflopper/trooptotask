<!-- PROTOTYPE — Organization Dashboard redesign exploration. Delete when done.
     Three variants, switchable via ?v= param, at /prototype/org-dashboard -->
<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	import VariantA from './VariantA.svelte';
	import VariantB from './VariantB.svelte';
	import VariantC from './VariantC.svelte';
	import type { Component } from 'svelte';

	const variants: { id: string; label: string; component: Component }[] = [
		{ id: 'a', label: 'A — Command Post', component: VariantA },
		{ id: 'b', label: 'B — Bento Board', component: VariantB },
		{ id: 'c', label: 'C — Split Rail', component: VariantC }
	];

	let activeVariant = $derived($page.url.searchParams.get('v') ?? 'a');
	const ActiveComponent = $derived(variants.find((v) => v.id === activeVariant)?.component ?? VariantA);

	function switchVariant(id: string) {
		const url = new URL($page.url);
		url.searchParams.set('v', id);
		goto(url.toString(), { replaceState: true, noScroll: true });
	}

	function handleKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

		const currentIndex = variants.findIndex((v) => v.id === activeVariant);
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			const prev = (currentIndex - 1 + variants.length) % variants.length;
			switchVariant(variants[prev].id);
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			const next = (currentIndex + 1) % variants.length;
			switchVariant(variants[next].id);
		}
	}
</script>

<svelte:head>
	<title>PROTOTYPE — Organization Dashboard</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-full flex-col bg-background">
	<ActiveComponent />
</div>

<!-- Floating variant switcher bar -->
<nav
	class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card px-2 py-1.5 shadow-lg"
	aria-label="Prototype variant switcher"
>
	<span class="px-2 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
		Prototype
	</span>
	{#each variants as variant (variant.id)}
		<button
			type="button"
			class="rounded-full px-3 py-1.5 font-mono text-xs font-semibold transition-colors {activeVariant === variant.id
				? 'bg-foreground text-background'
				: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
			onclick={() => switchVariant(variant.id)}
		>
			{variant.label}
		</button>
	{/each}
</nav>
