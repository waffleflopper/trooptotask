# Svelte And SvelteKit Guidance

Use this file for work that touches Svelte, SvelteKit, or generated shadcn-svelte components.

## Svelte MCP Tools

When asked about Svelte or SvelteKit topics, use the Svelte MCP documentation flow:

1. Call `list-sections` first to discover relevant documentation sections.
2. Read the returned `use_cases` and call `get-documentation` for every relevant section.
3. When writing Svelte code, run `svelte-autofixer` and keep applying fixes until it reports no issues or suggestions.
4. Ask whether Robert wants a `playground-link` only when code was not written directly to project files.

## shadcn-svelte Docs

- When working with shadcn-svelte components, reference `https://www.shadcn-svelte.com/llms.txt` first so you can jump to the specific component documentation before changing generated component source or showroom usage.
