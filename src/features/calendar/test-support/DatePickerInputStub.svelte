<script lang="ts">
	let {
		id,
		value = $bindable(''),
		placeholder,
		disabled = false,
		'aria-label': ariaLabel
	}: { id?: string; value?: string; placeholder?: string; disabled?: boolean; 'aria-label'?: string } = $props();
</script>

<input {id} type="date" bind:value {placeholder} {disabled} aria-label={ariaLabel} />
