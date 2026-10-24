<script lang="ts">
	import { SecurityPage, mfaSetupHref } from '$features/identity';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<SecurityPage
	security={{ hasMFA: data.hasMFA, currentEmail: data.currentEmail, pendingEmail: data.pendingEmail }}
	passwordCompletion={data.passwordCompletion}
	{form}
	mfaSetupHref={mfaSetupHref(data.shell.org.urlSegment)}
/>
