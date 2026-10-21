<script lang="ts">
	import type { QuickAddDialogProps } from '../../sections/dashboardSections';

	let { model, onClose }: QuickAddDialogProps = $props();
</script>

<div role="dialog" aria-label="Quick add for {model.data.orgName}">
	<button type="button" onclick={onClose}>Done</button>
</div>
