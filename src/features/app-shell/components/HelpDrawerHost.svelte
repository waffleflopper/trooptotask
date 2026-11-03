<script lang="ts" module>
	export type HelpModule = typeof import('$features/help');
</script>

<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import HelpDrawerLoadError from './HelpDrawerLoadError.svelte';
	import HelpDrawerSkeleton from './HelpDrawerSkeleton.svelte';

	type DrawerProps = Omit<ComponentProps<HelpModule['HelpDrawer']>, 'guides'>;

	/**
	 * Help is a lazy chunk. The skeleton holds its place while it loads. A failed load keeps the frame with Close and a
	 * page reload, since the browser may cache a failed import.
	 */
	let { load = () => import('$features/help'), ...drawer }: { load?: () => Promise<HelpModule> } & DrawerProps =
		$props();
</script>

{#await load()}
	<HelpDrawerSkeleton />
{:then { HelpDrawer, HELP_GUIDES }}
	<HelpDrawer guides={HELP_GUIDES} {...drawer} />
{:catch}
	<HelpDrawerLoadError onClose={drawer.onClose} />
{/await}
