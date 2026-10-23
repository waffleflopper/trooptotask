<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	const org = getAppShellContext();
	import { IctTaskLibraryPage } from '$features/critical-tasks';

	let { data } = $props();
</script>

<IctTaskLibraryPage
	{org}
	data={{ ...data, orgId: data.shell.org.id }}
	importHref={`/org/${org.orgUrlSegment}/critical-tasks/library/import`}
/>
