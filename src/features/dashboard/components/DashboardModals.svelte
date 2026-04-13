<script lang="ts">
	import type { DashboardContext } from '../contexts/DashboardContext.svelte';

	// ctx retained for call-site compatibility; no modals currently active
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { ctx } = $props<{ ctx: DashboardContext }>();
</script>
