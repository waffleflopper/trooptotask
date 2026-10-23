<script lang="ts">
	import type { QuickAddDialogProps } from '../../sections/dashboardSections';
	let { onClose }: QuickAddDialogProps = $props();
</script>

<div role="dialog" aria-label="Training record dialog">
	<button type="button" onclick={onClose}>Done</button>
</div>
