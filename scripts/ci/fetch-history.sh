#!/bin/sh
# A full-depth checkout also downloads every branch and tag, about 1 GiB here. The base comparisons
# need only the checked-out commit's history, main, and the pull request base.
# The checkout keeps no credentials, so this fetch passes the token for one command only.
set -eu
auth=$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)
echo "::add-mask::$auth"
git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $auth" \
	fetch --no-tags --unshallow origin '+refs/heads/main:refs/remotes/origin/main' ${BASE_SHA:+"$BASE_SHA"}
