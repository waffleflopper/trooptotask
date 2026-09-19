# Svelte And SvelteKit Guidance

Use this guide when implementing Svelte/SvelteKit behavior or answering framework questions. It does not require framework research for unrelated files or a prose-only edit.

## Documentation and validation

When Svelte MCP tools are available, call `list-sections`, select sections by their `use_cases`, and retrieve the sections relevant to the task with `get-documentation`. When writing Svelte components, run `svelte-autofixer`, resolve applicable findings and rerun after corrections. Explain any finding that does not apply rather than changing correct behavior to satisfy a suggestion.

If those tools are unavailable, use official Svelte/SvelteKit documentation for the specific question, inspect the repo's installed versions and run the [required local checks](../architecture/DEFINITION_OF_DONE.md#required-commands). Report the unavailable tool separately from checks that passed; an unavailable documentation tool does not block independent work or count as successful validation.

A `playground-link` is optional for standalone examples when useful or requested. Work written directly into the repo needs no playground confirmation.

## shadcn-svelte

When changing generated shadcn-svelte source or shared component usage, use the [project UI contract](ui-system.md) and the relevant component documentation from [shadcn-svelte's documentation index](https://www.shadcn-svelte.com/llms.txt).
