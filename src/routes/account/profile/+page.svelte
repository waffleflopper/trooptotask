<script lang="ts">
	import { invalidate } from '$app/navigation';
	import ProfilePage from '$features/identity/ProfilePage.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<ProfilePage
	account={data.account}
	ranks={data.ranks}
	{form}
	securityHref="/account/security"
	onretry={() => invalidate('app:account')}
/>
