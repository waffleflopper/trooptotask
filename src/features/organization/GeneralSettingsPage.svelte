<script lang="ts">
	import OrganizationSettingsSection from './OrganizationSettingsSection.svelte';
	import type { GeneralSettingsActionData, GeneralSettingsData } from './generalSettingsTypes';

	let { data, form } = $props<{ data: unknown; form: GeneralSettingsActionData }>();
	const settings = $derived(data as { generalSettings: GeneralSettingsData });
</script>

<OrganizationSettingsSection organization={settings.generalSettings.sections.organization} {form} />
