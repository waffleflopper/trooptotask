<script lang="ts">
	import { SecurityPage } from '$features/identity';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const mfaSetupHref = $derived(
		`/auth/mfa-setup?${new URLSearchParams({ next: `/org/${data.shell.org.urlSegment}/account/security` })}`
	);
</script>

<SecurityPage
	security={{ hasMFA: data.hasMFA, currentEmail: data.currentEmail, pendingEmail: data.pendingEmail }}
	passwordCompletion={data.passwordCompletion}
	{form}
	{mfaSetupHref}
/>
