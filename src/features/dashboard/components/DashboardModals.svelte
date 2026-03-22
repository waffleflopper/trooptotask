<script lang="ts">
	import DashboardCustomizeModal from '$lib/components/DashboardCustomizeModal.svelte';
	import type { DashboardContext } from '../contexts/DashboardContext.svelte';

	let { ctx }: { ctx: DashboardContext } = $props();
</script>

{#if ctx.showCustomizeModal}
	<DashboardCustomizeModal onClose={() => ctx.closeCustomizeModal()} />
{/if}
