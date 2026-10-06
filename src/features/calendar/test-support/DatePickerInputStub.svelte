<script lang="ts">
	let {
		id,
		value = $bindable(''),
		placeholder,
		disabled = false
	}: { id?: string; value?: string; placeholder?: string; disabled?: boolean } = $props();
</script>

<input {id} type="date" bind:value {placeholder} {disabled} />
