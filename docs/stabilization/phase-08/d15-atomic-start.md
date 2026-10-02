# D15 atomic Start

Same-issue continuation: `Refs #1363`, from merged [#1486](https://github.com/waffleflopper/trooptotask/pull/1486), `650e1d6bc0851d7b8e8bd0e77926f00d1d3b20fc`. Stage: baseline preparation. No application cutover or migration file is implemented yet; live reproduction and final acceptance remain pending.

## Selected outcome

Start must preserve the selected Person/template/calendar date and complete step snapshots, ordinary Onboarding policy/current Person scope, one active packet, Training-presence completion, public result/row identities and success audit. A failed checklist save must leave no partial active packet and permit a valid retry. Keep the normal native draft/error/retry/reload flow.

Current source saves the parent, performs Training preparation, saves progress, then separately deletes the parent on failure. Failed compensation is swallowed; zero affected rows are unconfirmed. A surviving active parent can block another Start. This is a source-established mechanism, with actual reproduction still pending. The intended narrow repair prepares snapshots before writes, then saves parent and progress through one Onboarding-owned ordinary authenticated invoker RPC. Existing table/policy/index contracts stay with their owners. A function migration is likely necessary and must be prepared and verified before Robert manually applies it; previous migration confirmations do not apply to a new file.

## Affected baseline and verification

The authoritative [packet recipe](../../../.agents/skills/verify-trooptotask/features/onboarding-packets.md#start-save-failure-and-retry) owns native driving steps and expected outcomes. Use only `npm run verify:app`, its native DevTools controls and documented helpers in the exact disposable worker. Freeze source, recipe, fixtures, helper, wrapper and plan before driving.

First use a fresh `onboarding-start` cohort for valid native Start/reload, exact three-step snapshots and expired matching Training-presence compatibility, then exact declared cohort cleanup. Use a fresh second cohort for paired provider progress INSERT/compensating parent DELETE faults. Capture genuine ordinary POST/error, native retained draft, exact parent/progress and originals. Restore both faults and prove catalog absence before the same native retry. If an empty active parent and blocked retry are observed, preserve both as failures against the approved expectation. Client interception and source inspection do not establish provider rollback.

Repeat affected native failure/retry/reload after the consumed atomic persistence change. Separately prove ordinary RPC attributes/grants/RLS, allowed/denied Organization/Group/lane cases, same-Organization references, snapshot defaults, insert/deferred failure rollback, simultaneous Start conflict without orphan rows, different-Person independence, full migration replay/contracts and populated upgrade retaining every original value. Cheap server/provider checks own policy/preparation/date/result/audit/error mapping; in-memory ports do not prove SQL transactions. Keep audit delivery and ambiguous fully committed responses outside the transaction guarantee.

Preserve complete original A/B Personnel, packets, progress, Training, templates and definitions. Record every generated identity before cleanup, restore fault/request controls, inspect real cascade absence, finish doctor and exact owned resource disposal. Native audit rows may remain until whole-worker disposal; do not claim complete database equality before then. Package baseline and final captures separately under the existing artifact contract only after disposal; archive hashes protect packaging, while independent expanded acceptance assesses actual observations.

## Scope and remaining gates

This complete bounded repair owns Start orchestration, the portable creation contract/provider, all request/context consumers, meaningful affected tests, one additive function migration, SQL/upgrade checks and matching repo-native proof. No generic transaction framework, privileged cleanup, old multiwrite fallback, new feature or second issue. Preserve supported input behavior; source-noted null/falsy-template ambiguity must be investigated rather than silently redefined.

Preparation target/cleanup guard checks currently pass (five offline cases with denied variants). Baseline/final live proof, full candidate checks/build, current-head CI, CodeRabbit review and independent complete source/expanded acceptance are pending. Other valid API boundaries, broader response ordering and whole-issue retention/composition remain with #1363; `08-M09-02a/b` stay unchecked. Final issue closure requires integrated acceptance of every obligation.
