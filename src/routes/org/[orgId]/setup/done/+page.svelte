<script lang="ts">
	import type { PageProps } from './$types';
	import { SetupDonePage } from '$features/organization';

	let { data }: PageProps = $props();
</script>

<SetupDonePage orgName={data.orgName} />
