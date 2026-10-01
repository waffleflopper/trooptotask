# D15 packet ownership and retained reconciliation work

## Outcome and scope

Intermediate #1363 / D15 / `08-M09-02a`: Onboarding owns packet lifecycle, step progress/notes, reconciliation, query/policy and packet mapping behind its public server seam and a narrow request-store port. API delivery and workspace orchestration consume that seam. Dashboard reads saved active packet snapshots through the public operation and applies its existing Personnel scope; it does not require an Onboarding/Training lane or recompute saved Training progress. Replaced central operations/models and the unused global progress entity are removed. Retention stays unchanged from accepted #1468. No migration or remote action.

First assignment of a null-template packet adopts only active exact-name/type legacy rows, at most once, retaining IDs, completion, paperwork stage and notes. The target must belong to the authenticated Organization before any write. Progress reconciles before the parent receives its first template, so a failed progress write leaves the legacy discriminator available for retry. Ordinary reconciliation deactivates deleted-definition history and retains every saved row; a later same-name definition gets a fresh step. Returned steps follow saved sort order, matching reload. This remains a multi-write operation: partial progress can persist on later insert/parent failures, and lower-level retry tests cover reuse without claiming transaction-wide rollback or concurrent safety.

Export/Web/history ownership and remaining Add Person, Calendar, export, security and same-Organization concurrency acceptance remain this issue's work. The packet recipe remains authoritative. This deliverable uses `Refs #1363`, keeps the issue open and does not unlock dependents.

## Baseline and checks

The [reconciliation baseline](d15-reconciliation-baseline.md) preserves actual matching-legacy assignment 400 and deleted-reference history omitted immediately/still active after reload. Earlier [packet recovery](d15-packet-recovery.md) remains applicable to unchanged client recovery. A separate unchanged-app Dashboard baseline supplies the matching Personnel-only read/progress and Group-filtering observations below.

Meaningful regressions failed before the ordering and first-assignment retry fixes. Final focused checks pass **7 files / 127 tests**; types **0 errors / 0 warnings**, lint and governance **569 inherited findings / no regression** pass. The foreign-target test's first attempt used a colliding appended fixture ID; its failure is preserved and corrected with a distinct foreign ID. No false product-failure credit. The frozen production launch/build passes. Full exact-head DoD/build and completed clean hosted bot review remain publication/merge gates.

Committed CodeRabbit CLI review of `6f2831bb5923538d80c6ee808eb3818793acd960` to `27de0d922074019728e6df66b9bb67e9859db79e` completes all **29 readable files**, zero findings. An initial invocation used obsolete flags and did not run; corrected installed-help syntax did. Two new archives require expanded independent acceptance; changed receipt/status prose requires changed-material review. Complete final independent acceptance is pending.

## Matching native and provider observations

Final owned worker 1 production run: revision `27de0d922074019728e6df66b9bb67e9859db79e`, candidate **`d9ec4e727692b0200f771b12264820a67b0dad7047ce27be313e83ac1330bf03`**, **4,542 input hashes captured before launch**, origin `http://127.0.0.1:41519`, session `6d02f0a8-47b8-4b4f-8c86-887188e41394`, project `t2t-verify-f6efecd5eb8e4428b86adafb`, native Chromium 152.0.7977.82 Arch Linux. Exact owned project/config hash, ports and container IDs/labels were captured before disposal. Driving scripts and bounded HTTP/provider probes are frozen with exact action inputs. The production app and schema remain frozen through final doctor and cleanup.

| Boundary                   | Observed result and limit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy rejection/retry     | A ledger/Organization/parent/step-restricted real PostgreSQL write fault causes actual assignment 500 and a readable retained-dialog error. Original parent and three progress rows remain exact. Fault removal is verified before native same-dialog retry. Actual retry 200 assigns the template, retains matched Orientation completion and Paperwork Reviewed stage/notes/IDs, deactivates unmatched history and adds only new Training. Reload/repeated resync retain four rows without duplicates. Later partial-write failures have lower-level coverage only. |
| Deleted definition         | Native deletion nulls the saved Orientation reference; native resync deactivates it, preserving ID, completion and both notes, while keeping unmatched historic work. Immediate/reloaded/repeated views and provider rows agree. These particular resync numeric statuses/bodies were not retained; no numeric 200 credit.                                                                                                                                                                                                                                            |
| Added/reordered definition | Native checkbox addition and two Move up actions precede explicit resync. Actual 200 response includes the new fresh step, retains the prior four rows and orders New First Task → Paperwork → Training in immediate and reloaded views. Removed history remains.                                                                                                                                                                                                                                                                                                     |
| Cancel/History/reopen      | Native cancellation preserves all five progress rows. History/reload retain removed completed work, Reviewed paperwork and its visible original seeded note. A separate ordinary authenticated API reopen returns 200, clears cancelledAt and retains five rows; native active-card readback agrees. No UI reopen control or native new-note editor is claimed. An additional Orientation note was added by ordinary API and verified in provider rows only.                                                                                                          |
| Denied writes              | Ten individually captured valid-body requests: eight permission/Group-scope 403s and two precise foreign-Organization/template 404s. Normal HTML sign-in/session confirmation, actor, exact body, result and four A/B packet/progress before/after captures are retained per case. Exact selected business fields are unchanged. This is bounded API proof, not the whole security matrix, omitted timestamp proof or native UI interaction.                                                                                                                          |
| Dashboard                  | Fresh matching legacy and retention cohorts: Personnel-only Manager sees two active packets (Unassigned 100%, Alpha legacy 67%); Alpha-only PersonnelScoped sees only legacy 67%. Both native views/reloads agree, without Onboarding/Training navigation. After seed cleanup both reload to no active packets. Saved Training snapshot semantics additionally have focused lower-level coverage.                                                                                                                                                                     |
| Restoration                | Temporary template/definitions and helper cohorts are removed. Original selected A packet/progress fields (one parent/three steps) and empty B packet/progress remain exact. Final doctor and owned cleanup pass; exact project-label container/volume/network inventories and private worker directory are absent. No existing local or remote provider is used.                                                                                                                                                                                                     |

The first final cleanup driver requested unsupported `onboarding_steps` after successfully collecting Dashboard reload/cleanup and A packet/progress/template readbacks. The helper rejected before a provider query; stderr is retained. The corrected driver uses `onboarding_template_steps`, completes A/B comparisons and disposal. The seed ledger is empty. HTTP helper cleanup reports admitted sessions cleared; its parent directory still existed before complete worker disposal. No separate empty-cache-directory check is claimed.

The unchanged Dashboard run uses revision `63df1558e6192307cd0935b412be50760b6c4db6`, candidate `18a313fbbbd15aeefca386ed355163ffe5dc7e4ca1f5239f63e3d779d1d7ec65`, origin `http://127.0.0.1:34323`, session `3663dcf5-1c3c-4400-b607-ccba288f616a`. All 4,542 hashes were reconstructed after cleanup; they do not earn pre-execution capture credit. Native Manager two/100%/67% and scoped one/67%, then both zero after cleanup, pass. Original selected A packet/progress remain; B equality is unestablished for this baseline. Doctor/owned cleanup pass, but active provider/config/ports and exact Docker disposal inventories were not exported; that run earns no exact-project disposal credit. Independent expanded/source acceptance passes all 77 payloads and reconstructed inputs. No unchanged-baseline export/Calendar/native creation/concurrency claim.

Schema/SQL bytes are unchanged; the previous owned 46-file/1,213-assertion SQL result remains applicable. This run replays migrations for owned setup without a new SQL-suite execution. Provider readbacks omit whole-row timestamps. The selected runs do not establish all issue security/concurrency or a second independent live execution. Three native request-detail Cookie headers are redacted; request/response bodies are unchanged. No credential-pattern hits were found in final synthetic evidence.

## Durable evidence

| Archive                                              | Payloads | SHA-256                                                            |
| ---------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| [Unchanged Dashboard](d15-dashboard-baseline.tar.gz) | 77       | `4ad68ee5563b99c9fb5f3684d64e00f9bfa8149f4dd28e8d5a15f5fbbcf1a59a` |
| [Final packet run](d15-packets-final.tar.gz)         | 887      | `506a94827baf2ae4d16539420d467603a622ac46130fad8275d74c925c102472` |

Each inventory excludes itself and preserves original relative filenames and sanitized expanded-byte hashes. Both packages were added only after final owned cleanup, then extracted into fresh ignored directories with exact payload-set/all-hash checks. Packaging and ordinary receipt/status prose do not relabel the tested revision/digest; no executable input changes follow proof.

```bash
set -e
sha256sum --check <<'SHA256'
4ad68ee5563b99c9fb5f3684d64e00f9bfa8149f4dd28e8d5a15f5fbbcf1a59a  docs/stabilization/phase-08/d15-dashboard-baseline.tar.gz
506a94827baf2ae4d16539420d467603a622ac46130fad8275d74c925c102472  docs/stabilization/phase-08/d15-packets-final.tar.gz
SHA256
mkdir -p ".verification/evidence/verify-trooptotask"
for task_archive in d15-dashboard-baseline d15-packets-final; do
  task_review_dir=$(mktemp -d ".verification/evidence/verify-trooptotask/${task_archive}-review.XXXXXX")
  tar -xzf "docs/stabilization/phase-08/${task_archive}.tar.gz" -C "$task_review_dir"
  python - "$task_review_dir" <<'PY'
from pathlib import Path
import hashlib, json, sys
p = Path(sys.argv[1])
expected = json.loads((p / 'inventory.json').read_text())
actual = {f.relative_to(p).as_posix(): hashlib.sha256(f.read_bytes()).hexdigest()
          for f in p.rglob('*') if f.is_file() and f.relative_to(p).as_posix() != 'inventory.json'}
assert actual == expected
PY
done
```

## Concurrent default integration

Separately owned D13 verification #1469 / `f97249ef` is integrated. Its unique retention helper/tests, five archives, accepted source tests and feature instructions retain incoming bytes. Shared controls and verification SKILL gain only the already accepted Personnel artifact-retention command/documentation; Onboarding command branches, app/provider/recipe inputs and both new D15 archive bytes remain unchanged. TODO preserves the fresh parallel D13 checkpoint and this D15 checkpoint; EVIDENCE retains both records. This is inspected integration with affected control syntax/helper/document checks, not a new live run. The original captured revision/digest remain the provenance for D15 proof; integrated-head full CI/build and completed review remain gates.
