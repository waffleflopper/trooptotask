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
const component = (script: string, expression: string | null) =>
	`<script lang="ts">${script}</script><form method="POST" use:enhance${expression === null ? '' : `={${expression}}`}></form>`;
const fixture = (script: string, expression: string | null = null) => ({
	code: component(script, expression),
	filename: path.join(root, 'Form.svelte')
});

tester.run('require-settled-enhance', rule, {
	valid: [
		{ code: '<form method="POST"></form>', filename: 'Plain.svelte' },
		fixture('', '() => settleAction()'),
		fixture('const submit = () => settleAction();', 'submit'),
		fixture('const submit = () => helper(); function helper() { return settleAction(); }', 'submit'),
		fixture(
			'const submit = () => helper(); const helper = () => finish(); const finish = () => settleAction();',
			'submit'
		),
		fixture('const submit = () => helper(); function helper() { return settleAction(); }', '() => submit()'),
		fixture("import { enhanceFor } from './settled.svelte';", 'enhanceFor'),
		fixture("import { enhanceFor } from './helpers';", 'enhanceFor'),
		fixture("import { enhanceFor } from './helpers/index.js';", 'enhanceFor'),
		fixture("import { enhanceFor } from './settled.svelte'; const submit = () => enhanceFor();", 'submit'),
		fixture(
			"import { enhanceFor } from './settled.svelte'; const actions = { submit: enhanceFor };",
			'actions.submit()'
		),
		...['$lib', '$features', '$routes', '$custom'].map((alias) =>
			fixture(`import { enhanceFor } from '${alias}/settled.svelte';`, 'enhanceFor')
		)
	],
	invalid: [
		{
			...fixture(
				"import { restoreFocus } from '../../../src/lib/utils/settleAction'; const submit = () => restoreFocus([]);",
				'submit'
			),
			errors: [{ messageId: 'unsettled' }]
		},
		{ ...fixture("import { enhance } from '$app/forms';"), errors: [{ messageId: 'unsettled' }] },
		{ ...fixture("import { settleAction } from './settled.svelte';"), errors: [{ messageId: 'unsettled' }] },
		{
			...fixture(''),
			code: `<script lang="ts">const submit = () => settleAction();</script>
<form use:enhance={submit}></form>
<form use:enhance></form>`,
			errors: [{ messageId: 'unsettled', line: 3, column: 7 }]
		},
		{
			...fixture(''),
			code: `<script lang="ts">const submit = () => settleAction();</script>
<form use:enhance={submit}></form>
<form use:enhance={() => {}}></form>`,
			errors: [{ messageId: 'unsettled', line: 3, column: 7 }]
		},
		{ ...fixture("// settleAction\nconst message = 'settleAction';"), errors: [{ messageId: 'unsettled' }] },
		...['./unsafe', './indirect', './missing', '$unknown/settled.svelte'].map((module) => ({
			...fixture(`import { enhanceFor } from '${module}';`, 'enhanceFor'),
			errors: [{ messageId: 'unsettled' }]
		})),
		{
			...fixture("import type { enhanceFor } from './settled.svelte';", 'enhanceFor'),
			errors: [{ messageId: 'unsettled' }]
		},
		{ ...fixture("import { enhanceFor } from './settled.svelte';", '() => {}'), errors: [{ messageId: 'unsettled' }] },
		{ ...fixture("import { enhanceFor } from './settled.svelte';", null), errors: [{ messageId: 'unsettled' }] },
		{
			...fixture('const submit = () => helper(); const helper = () => submit();', 'submit'),
			errors: [{ messageId: 'unsettled' }]
		},
		{
			...fixture(
				'const helper = () => settleAction(); const submit = () => { const helper = () => {}; return helper(); };',
				'submit'
			),
			errors: [{ messageId: 'unsettled' }]
		},
		{
			...fixture(''),
			code: '<form use:enhance></form><form use:enhance></form>',
			errors: [{ messageId: 'unsettled' }, { messageId: 'unsettled' }]
		}
	]
});
