<script lang="ts">
	let { onComplete }: { onComplete: () => void } = $props();
</script>

<button type="button" onclick={onComplete}>Finish removal</button>
