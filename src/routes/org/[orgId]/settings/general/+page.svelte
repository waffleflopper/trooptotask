<script lang="ts">
	import type { PageProps } from './$types';
	import { GeneralSettingsPage, SettingsPageHeader } from '$features/organization';

	let { data, form }: PageProps = $props();

	const unit = $derived(data.orgName ?? 'the unit');
</script>

<SettingsPageHeader
	page="general"
	subtitle={`What ${unit} is called and where it lives. The name prints on every brief and roster; the address is in every bookmark your soldiers have saved.`}
/>

{#key data.orgId}
	<GeneralSettingsPage {data} {form} />
{/key}
