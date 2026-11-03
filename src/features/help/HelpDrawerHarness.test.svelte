<script lang="ts">
	import { untrack, type ComponentProps } from 'svelte';
	import HelpDrawer from './HelpDrawer.svelte';

	let {
		initialGuide = undefined,
		...drawer
	}: { initialGuide?: string | null } & Pick<
		ComponentProps<typeof HelpDrawer>,
		'guides' | 'viewer' | 'routeKey' | 'orgUrlSegment' | 'url' | 'onFeedback'
	> = $props();
	const start = untrack(() => initialGuide);
	let open = $state(start !== undefined);
	let guideId = $state<string | null>(start ?? null);
</script>

<button type="button" data-help-trigger onclick={() => (open = true)}>Open help</button>
{#if open}
	<HelpDrawer
		{...drawer}
		{guideId}
		onOpenGuide={(id) => (guideId = id)}
		onShowList={() => (guideId = null)}
		onClose={() => {
			open = false;
			guideId = null;
		}}
	/>
{/if}
