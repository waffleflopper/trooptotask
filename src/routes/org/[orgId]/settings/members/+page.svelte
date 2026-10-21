<script lang="ts">
	import type { PageProps } from './$types';
	import { MembersSettingsPage, SettingsPageHeader } from '$features/organization';

	let { data, form }: PageProps = $props();

	const unit = $derived(data.orgName ?? 'the unit');
	// Settings page data unions with an empty record, which hides root layout keys from its type.
	const viewerUserId = $derived((data as { viewer?: { userId: string } | null }).viewer?.userId);
</script>

<SettingsPageHeader
	page="members"
	subtitle={`Who can sign in to ${unit} and what they can touch. A role sets authority; a preset sets day-to-day access, and you can adjust it area by area.`}
/>

{#key data.orgId}
	<MembersSettingsPage settings={data.membersSettings} {form} {unit} {viewerUserId} />
{/key}
