<script lang="ts">
	let { value }: { value: { name: string; onOpen: () => void } } = $props();
</script>

<button type="button" class="size-full truncate text-left text-[10px]" onclick={value.onOpen}>{value.name}</button>
