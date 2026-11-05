<script lang="ts">
	import { onNavigate } from '$app/navigation';
	import { updated } from '$app/state';
	import { toastStore } from '$lib/stores/toast.svelte';

	$effect(() => {
		if (!updated.current) return;
		toastStore.persistent({
			id: 'app-update',
			message: 'A new version of TroopToTask is available.',
			action: { label: 'Refresh', onClick: () => location.reload() },
			dismissLabel: 'Later'
		});
	});

	// onNavigate runs only after every beforeNavigate guard let the link through, so unsaved work has already blocked
	// it. The pending promise parks the SPA navigation while the browser loads the page, as SvelteKit's own full loads do.
	onNavigate((navigation) => {
		if (!updated.current || navigation.type !== 'link' || !navigation.to) return;
		location.href = navigation.to.url.href;
		return new Promise<void>(() => {});
	});
</script>
