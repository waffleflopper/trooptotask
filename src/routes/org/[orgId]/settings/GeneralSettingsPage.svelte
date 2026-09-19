<script lang="ts">
	import OrganizationSettingsSection from './OrganizationSettingsSection.svelte';
	import type { GeneralSettingsData } from './settingsGeneral.server';

	type SettingsPageData = {
		generalSettings: GeneralSettingsData;
	};

	type SettingsActionData = {
		[key: string]: unknown;
		nameSuccess?: boolean;
		slugSuccess?: boolean;
		error?: string;
		slugError?: string;
	} | null;

	let { data, form } = $props<{ data: unknown; form: SettingsActionData }>();

	let nameLoading = $state(false);
	let slugLoading = $state(false);
	const settingsData = $derived(data as SettingsPageData);
	const organizationSection = $derived(settingsData.generalSettings.sections.organization);
</script>

<OrganizationSettingsSection organization={organizationSection} {form} bind:nameLoading bind:slugLoading />
