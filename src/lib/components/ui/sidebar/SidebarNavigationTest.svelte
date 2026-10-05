<script lang="ts">
	import * as Sidebar from './index.js';
	import SidebarNavigationContentTest from './SidebarNavigationContentTest.svelte';

	let { cancelNavigation = false }: { cancelNavigation?: boolean } = $props();
</script>

<Sidebar.Provider>
	<SidebarNavigationContentTest {cancelNavigation} />
</Sidebar.Provider>
