<script lang="ts">
	// Stands in for Training's type editor where a test never opens it.
	let { typeId }: { typeId: string | null } = $props();
</script>

<div hidden data-type-id={typeId}></div>
