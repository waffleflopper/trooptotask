<script lang="ts">
	let { id, value = $bindable(''), placeholder, disabled = false } = $props();
</script>

<input {id} type="date" bind:value {placeholder} {disabled} />
