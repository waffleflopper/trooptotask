<script lang="ts">
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';

	function add() {
		statusTypesStore.load([], 'alpha');
		void statusTypesStore.add({ name: 'Leave' } as never).catch(() => {});
	}
</script>

<button type="button" onclick={add}>Add status type</button>
