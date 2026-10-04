<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	const org = getAppShellContext();
	import { IctTaskLibraryPage } from '$features/critical-tasks';

	let { data } = $props();
</script>

<IctTaskLibraryPage {org} {data} />
