<!-- PROTOTYPE — Training Reports redesign exploration. Delete when done. -->
<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	import VariantA from './VariantA.svelte';
	import VariantB from './VariantB.svelte';
	import VariantC from './VariantC.svelte';
	import VariantD from './VariantD.svelte';
	import VariantE from './VariantE.svelte';

	const variants = [
		{ id: 'e', label: 'E — Cards + Dashboard', component: VariantE },
		{ id: 'a', label: 'A — Command Dashboard', component: VariantA },
		{ id: 'b', label: 'B — Card Grid Intel', component: VariantB },
		{ id: 'c', label: 'C — Split Rail', component: VariantC },
		{ id: 'd', label: 'D — Dense Ops Table', component: VariantD }
	] as const;

	let activeVariant = $derived($page.url.searchParams.get('v') ?? 'e');
	const activeComponent = $derived(variants.find((v) => v.id === activeVariant)?.component ?? VariantE);

	function switchVariant(id: string) {
		const url = new URL($page.url);
		url.searchParams.set('v', id);
		goto(url.toString(), { replaceState: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>PROTOTYPE — Training Reports Redesign</title>
</svelte:head>

<div class="min-h-screen bg-background">
	<svelte:component this={activeComponent} />
</div>

<!-- Floating variant switcher bar -->
<nav
	class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card px-2 py-1.5 shadow-lg"
	aria-label="Prototype variant switcher"
>
	<span class="px-2 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground"
		>Prototype</span
	>
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
