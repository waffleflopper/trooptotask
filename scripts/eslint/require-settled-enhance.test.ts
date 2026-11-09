import path from 'node:path';
import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import svelteParser from 'svelte-eslint-parser';
import tsParser from '@typescript-eslint/parser';
import rule from './require-settled-enhance.mjs';

RuleTester.describe = describe;
RuleTester.it = it;

const root = path.join(import.meta.dirname, 'fixtures');
const tester = new RuleTester({
	languageOptions: { parser: svelteParser, parserOptions: { parser: tsParser } }
});
const component = (script: string) => `<script lang="ts">${script}</script><form method="POST" use:enhance></form>`;
const fixture = (script: string) => ({
	code: component(script),
	filename: path.join(root, 'Form.svelte')
});

tester.run('require-settled-enhance', rule, {
	valid: [
		{ code: '<form method="POST"></form>', filename: 'Plain.svelte' },
		fixture("import { enhance } from '$app/forms'; const submit = () => settleAction();"),
		fixture("import { enhanceFor } from './settled.svelte';"),
		fixture("import { enhanceFor } from './helpers';"),
		fixture("import { enhanceFor } from './helpers/index.js';"),
		...['$lib', '$features', '$routes', '$custom'].map((alias) =>
			fixture(`import { enhanceFor } from '${alias}/settled.svelte';`)
		)
	],
	invalid: [
		{ ...fixture("import { enhance } from '$app/forms';"), errors: [{ messageId: 'unsettled' }] },
		{ ...fixture("// settleAction\nconst message = 'settleAction';"), errors: [{ messageId: 'unsettled' }] },
		...['./unsafe', './indirect', './missing', '$unknown/settled.svelte'].map((module) => ({
			...fixture(`import { enhanceFor } from '${module}';`),
			errors: [{ messageId: 'unsettled' }]
		})),
		{ ...fixture("import type { enhanceFor } from './settled.svelte';"), errors: [{ messageId: 'unsettled' }] },
		{
			...fixture(''),
			code: '<form use:enhance></form><form use:enhance></form>',
			errors: [{ messageId: 'unsettled' }, { messageId: 'unsettled' }]
		}
	]
});
