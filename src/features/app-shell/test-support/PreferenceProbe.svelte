<script lang="ts">
	import { getAccountPreferencesContext } from '$features/identity';
	import { getAppShellContext } from '$features/app-shell';
	const preferences = getAccountPreferencesContext();
	const shell = getAppShellContext();
</script>

<label>
	<input
		type="checkbox"
		checked={preferences.value.calendar.showStatusText}
		onchange={(event) => preferences.patch({ calendar: { showStatusText: event.currentTarget.checked } })}
	/>
	Show status text
</label>
<button onclick={() => preferences.patch({ training: { matrixViewMode: 'alphabetical' } })}>Choose alphabetical</button>
<output aria-label="Training grouping">{preferences.value.training.matrixViewMode}</output>
<button onclick={() => shell.autoShowWhatsNew()}>Check updates</button>
