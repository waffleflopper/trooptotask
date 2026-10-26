<script lang="ts">
	let { onSaved, onClose }: { onSaved: () => void; onClose: () => void } = $props();
</script>

<button type="button" onclick={() => onSaved()}>Save picks</button>
<button type="button" onclick={onClose}>Cancel picks</button>
