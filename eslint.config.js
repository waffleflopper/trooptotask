import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: { parser: ts.parser }
		}
	},
	{
		files: ['**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: { parser: ts.parser }
		}
	},
	{
		rules: {
			// --- TypeScript ---

			// No `any` — use `unknown` and narrow the type. To override per-line:
			//   // eslint-disable-next-line @typescript-eslint/no-explicit-any -- <reason>
			'@typescript-eslint/no-explicit-any': 'error',

			// Allow unused vars prefixed with _
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

			// Svelte reactive statements trigger this incorrectly
			'@typescript-eslint/no-unused-expressions': 'off',

			// --- Svelte ---

			// This app uses static href strings, not resolve() — not applicable
			'svelte/no-navigation-without-resolve': 'off',

			// SvelteMap/SvelteDate not needed for non-reactive contexts (stores, server code)
			// and would require large refactors — warn for awareness, don't block
			'svelte/prefer-svelte-reactivity': 'warn',

			// Good practice but not blocking — many existing {#each} blocks lack keys
			'svelte/require-each-key': 'warn',

			// Writable $derived is a newer Svelte 5 pattern — refactor incrementally
			'svelte/prefer-writable-derived': 'warn',

			// --- General JS ---

			// Allow fallthrough in switches when intentional (common in reducers/parsers)
			'no-fallthrough': ['error', { commentPattern: 'falls?\\s*through' }],

			// Allow hasOwnProperty — Object.hasOwn not available in all target envs
			'no-prototype-builtins': 'off'
		}
	},
	{
		ignores: ['.svelte-kit/', 'build/', 'node_modules/', '.claude/', '.superpowers/', '.vercel/']
	}
);
