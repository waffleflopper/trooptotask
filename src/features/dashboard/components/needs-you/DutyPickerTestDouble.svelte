<script lang="ts">
	let { date, onClose }: { date: Date; onClose: () => void } = $props();
</script>

<div role="dialog" aria-label="Duty picker for {date.getDate()}">
	<button type="button" onclick={onClose}>Close picker</button>
</div>
