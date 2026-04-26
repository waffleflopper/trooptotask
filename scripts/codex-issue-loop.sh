#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat <<'EOF'
Usage:
  scripts/codex-issue-loop.sh [options] ISSUE...

Runs one fresh `codex exec --ephemeral` session per GitHub issue.
Each issue starts from a clean worktree. If Codex finishes successfully and
leaves changes uncommitted, this script commits them before moving on.

Options:
  --repo OWNER/REPO       GitHub repo to read issues from. Defaults to current gh repo.
  --tdd                  Tell Codex to use the tdd skill for issues by default.
  --search               Enable native Codex web search for each issue run.
  --fast                 Enable Codex fast mode for each issue run.
  --model MODEL          Optional Codex model override.
  --profile PROFILE      Optional Codex config profile.
  --skip-verify          Skip enforced verification before fallback commits.
  --dry-run              Print the generated prompts without running Codex.
  -h, --help             Show this help.

Example:
  scripts/codex-issue-loop.sh --tdd --search --fast 650 651 652 653
EOF
}

repo=""
use_tdd=false
enable_search=false
enable_fast=false
model=""
profile=""
dry_run=false
skip_verify=false
issues=()

while [[ $# -gt 0 ]]; do
	case "$1" in
		--repo)
			repo="${2:?--repo requires OWNER/REPO}"
			shift 2
			;;
		--tdd)
			use_tdd=true
			shift
			;;
		--search)
			enable_search=true
			shift
			;;
		--fast)
			enable_fast=true
			shift
			;;
		--model)
			model="${2:?--model requires a value}"
			shift 2
			;;
		--profile)
			profile="${2:?--profile requires a value}"
			shift 2
			;;
		--skip-verify)
			skip_verify=true
			shift
			;;
		--dry-run)
			dry_run=true
			shift
			;;
		-h|--help)
			usage
			exit 0
			;;
		--)
			shift
			issues+=("$@")
			break
			;;
		-*)
			echo "Unknown option: $1" >&2
			usage >&2
			exit 2
			;;
		*)
			issues+=("$1")
			shift
			;;
	esac
done

if [[ ${#issues[@]} -eq 0 ]]; then
	echo "No issue numbers provided." >&2
	usage >&2
	exit 2
fi

if [[ -z "$repo" ]]; then
	repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

require_clean_worktree() {
	if [[ -n "$(git status --porcelain)" ]]; then
		echo "Worktree is not clean. Commit, stash, or inspect changes before continuing." >&2
		git status --short >&2
		exit 1
	fi
}

issue_uses_tdd() {
	[[ "$use_tdd" == true ]]
}

commit_issue_changes() {
	local issue="$1"
	local title="$2"

	if [[ -z "$(git status --porcelain)" ]]; then
		return
	fi

	echo "==> Codex left changes for issue #$issue; creating local commit"
	git add -A

	if git diff --cached --quiet; then
		echo "No staged changes found after git add." >&2
		exit 1
	fi

	git commit -m "Issue #$issue: $title"
}

run_required_verification() {
	if [[ "$skip_verify" == true ]]; then
		echo "==> Skipping enforced verification because --skip-verify was provided"
		return
	fi

	echo "==> Running required verification before fallback commit"
	npm run format
	npm run lint
	npm run governance:check
	npm run check
	npm run test
}

for issue in "${issues[@]}"; do
	if [[ "$dry_run" != true ]]; then
		require_clean_worktree
	fi

	echo "==> Fetching issue #$issue from $repo"
	title="$(gh issue view "$issue" --repo "$repo" --json title --jq .title)"
	body="$(gh issue view "$issue" --repo "$repo" --json body --jq .body)"
	url="$(gh issue view "$issue" --repo "$repo" --json url --jq .url)"

	prompt_file="$(mktemp "${TMPDIR:-/tmp}/codex-issue-${issue}.XXXXXX.md")"
	cleanup_prompt() {
		rm -f "$prompt_file"
	}
	trap cleanup_prompt EXIT

	{
		echo "You are working in $repo_root on GitHub issue #$issue: $title"
		echo
		echo "Issue URL: $url"
		echo
		if issue_uses_tdd "$issue"; then
			echo "Use the repo-local tdd skill for this issue. Work test-first where it is useful, but keep tests behavior-focused and avoid duplicating the same behavior at multiple layers."
			echo
		else
			echo "Do not force TDD for this issue unless the issue body clearly calls for implementation behavior that needs tests."
			echo
		fi
		echo "Follow AGENTS.md and all repo instructions."
		echo
		echo "Work this issue to completion, then stop. Do not start the next issue."
		echo
		echo "Completion requirements:"
		echo "- Keep the scope limited to this issue."
		echo "- Preserve current behavior unless the issue explicitly changes it."
		echo "- Run the required verification before claiming completion: npm run format, npm run lint, npm run governance:check, npm run check, and npm run test."
		echo "- If verification fails, fix the issue and rerun the relevant checks, then rerun the full required verification before final completion."
		echo "- If a product/design/API decision is ambiguous, stop and say exactly what needs a human decision."
		echo "- If the work completes and verification passes, create a local git commit for this issue only if you can, using a clear message that starts with \"Issue #$issue:\". If you leave verified changes uncommitted, the runner will create the commit before moving on."
		echo "- In the final response, summarize changed files, verification results, and the commit SHA if you created one."
		echo
		echo "Issue body:"
		echo
		echo "$body"
	} > "$prompt_file"

	if [[ "$dry_run" == true ]]; then
		echo
		echo "----- Prompt for issue #$issue -----"
		cat "$prompt_file"
		echo "----- End prompt for issue #$issue -----"
		cleanup_prompt
		trap - EXIT
		continue
	fi

	codex_args=()
	if [[ "$enable_search" == true ]]; then
		codex_args+=(--search)
	fi
	if [[ "$enable_fast" == true ]]; then
		codex_args+=(--enable fast_mode)
	fi
	codex_args+=(exec --full-auto --ephemeral -C "$repo_root")
	if [[ -n "$model" ]]; then
		codex_args+=(--model "$model")
	fi
	if [[ -n "$profile" ]]; then
		codex_args+=(--profile "$profile")
	fi

	echo "==> Starting fresh Codex session for issue #$issue"
	codex "${codex_args[@]}" - < "$prompt_file"

	run_required_verification
	commit_issue_changes "$issue" "$title"
	require_clean_worktree
	echo "==> Issue #$issue finished with a clean worktree"
	cleanup_prompt
	trap - EXIT
done

echo "All requested issues finished."
