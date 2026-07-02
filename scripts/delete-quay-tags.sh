#!/usr/bin/env bash
# delete-quay-tags.sh
# Deletes all tags from the target Quay repository that are NOT:
#   - semantic version tags starting with v (e.g. v0.5.0, v0.1.0-alpha.1)
#   - "latest"
#   - "main"
#
# Tag listing  — uses skopeo with the Docker/Podman auth file (docker login).
# Tag deletion — uses the Quay.io REST API (oauth2_implicit), which requires a
#                separate OAuth2 access token with "repo:admin" scope.
#
# To generate a Quay.io OAuth token:
#   1. Log in to quay.io
#   2. Go to (Account or Org) Settings → Applications → Create Application
#   3. Click "Generate Token", tick "Administer Repositories", copy the token
#
# Usage:
#   QUAY_TOKEN=<oauth-token> ./scripts/delete-quay-tags.sh
#   DRY_RUN=true QUAY_TOKEN=<oauth-token> ./scripts/delete-quay-tags.sh
#   AUTHFILE=~/.config/containers/auth.json QUAY_TOKEN=<oauth-token> ./scripts/delete-quay-tags.sh
#   REPO=quay.io/kuadrant/console-plugin QUAY_TOKEN=<oauth-token> ./scripts/delete-quay-tags.sh

set -uo pipefail

for tool in skopeo jq curl; do
	if ! command -v "${tool}" &>/dev/null; then
		echo "Error: ${tool} not found in PATH. Install it before running this script."
		exit 1
	fi
done

REPO="${REPO:-quay.io/kuadrant/console-plugin}"
QUAY_REPO="${REPO#quay.io/}" # kuadrant/console-plugin
BATCH_SIZE=25
DRY_RUN="${DRY_RUN:-false}"

# Keeps: "latest" or semver (optional v, MAJOR.MINOR.PATCH, optional pre-release/build metadata)
KEEP_PATTERN='^(latest|main|v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9._-]+)?(\+[a-zA-Z0-9._-]+)?)$'

# ── Credentials ──────────────────────────────────────────────────────────────

# OAuth2 token for the Quay.io REST API (tag deletion).
if [[ -z "${QUAY_TOKEN:-}" ]]; then
	echo "Error: QUAY_TOKEN is required for tag deletion."
	echo ""
	echo "Generate one at: quay.io → Settings → Applications → Generate Token"
	echo "Required scope: Administer Repositories"
	echo ""
	echo "Usage: QUAY_TOKEN=<oauth-token> $0"
	exit 1
fi

# Auth file for skopeo (tag listing). Auto-detected from standard locations.
AUTHFILE_PATH="${AUTHFILE:-}"
if [[ -z "${AUTHFILE_PATH}" ]]; then
	for candidate in \
		"${HOME}/.docker/config.json" \
		"${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/containers/auth.json" \
		"${HOME}/.config/containers/auth.json"; do
		if [[ -f "${candidate}" ]]; then
			AUTHFILE_PATH="${candidate}"
			break
		fi
	done
fi

if [[ -z "${AUTHFILE_PATH}" ]]; then
	echo "Error: No auth file found for skopeo. Please run: docker login quay.io"
	exit 1
fi

SKOPEO_AUTH=(--authfile "${AUTHFILE_PATH}")

# ── Helpers ───────────────────────────────────────────────────────────────────

separator() {
	printf '%.0s━' {1..80}
	echo
}

# ── Fetch tags ────────────────────────────────────────────────────────────────

if [[ "${DRY_RUN}" == "true" ]]; then
	echo "[DRY RUN — no images will actually be deleted]"
	echo ""
fi

echo "Fetching tags from ${REPO}..."
if ! TAGS_JSON=$(skopeo list-tags "${SKOPEO_AUTH[@]}" "docker://${REPO}" 2>&1); then
	echo "Error fetching tags:"
	echo "${TAGS_JSON}"
	exit 1
fi

if ! echo "${TAGS_JSON}" | jq -e '.Tags' >/dev/null 2>&1; then
	echo "Unexpected response from skopeo:"
	echo "${TAGS_JSON}"
	exit 1
fi

mapfile -t ALL_TAGS < <(echo "${TAGS_JSON}" | jq -r '.Tags[]')
echo "Found ${#ALL_TAGS[@]} tags total."

# ── Classify tags ─────────────────────────────────────────────────────────────

TO_DELETE=()
TO_KEEP=()

for tag in "${ALL_TAGS[@]}"; do
	if [[ "${tag}" =~ ${KEEP_PATTERN} ]]; then
		TO_KEEP+=("${tag}")
	else
		TO_DELETE+=("${tag}")
	fi
done

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "Tags to KEEP (${#TO_KEEP[@]}):"
if [[ ${#TO_KEEP[@]} -gt 0 ]]; then
	printf '  ✓ %s\n' "${TO_KEEP[@]}"
else
	echo "  (none)"
fi

echo ""
echo "Tags to DELETE (${#TO_DELETE[@]}):"
if [[ ${#TO_DELETE[@]} -eq 0 ]]; then
	echo "  (none — nothing to do)"
	exit 0
fi
printf '  ✗ %s\n' "${TO_DELETE[@]}"

echo ""
separator
read -rp "Proceed with deletion of ${#TO_DELETE[@]} tags from ${REPO}? [y/N] " confirm
separator
if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
	echo "Aborted."
	exit 0
fi

# ── Delete loop ───────────────────────────────────────────────────────────────

echo ""
deleted=0
failed=0
batch_count=0

for tag in "${TO_DELETE[@]}"; do
	printf "  Deleting %-55s " "${tag}..."

	if [[ "${DRY_RUN}" == "true" ]]; then
		echo "[DRY RUN]"
		deleted=$((deleted + 1))
	else
		http_code=$(curl -s -o /dev/null -w "%{http_code}" \
			--connect-timeout 10 \
			--max-time 30 \
			-X DELETE \
			-H "Authorization: Bearer ${QUAY_TOKEN}" \
			"https://quay.io/api/v1/repository/${QUAY_REPO}/tag/${tag}") || true
		http_code="${http_code:-CURL_ERROR}"
		if [[ "${http_code}" =~ ^2 ]]; then
			echo "✓"
			deleted=$((deleted + 1))
		else
			echo "✗  FAILED (HTTP ${http_code})"
			failed=$((failed + 1))
		fi
	fi

	batch_count=$((batch_count + 1))

	# Pause for confirmation every BATCH_SIZE deletions (unless this is the last one)
	if ((batch_count % BATCH_SIZE == 0 && batch_count < ${#TO_DELETE[@]})); then
		remaining=$((${#TO_DELETE[@]} - batch_count))
		echo ""
		separator
		printf "  Checkpoint — %d deleted, %d failed | %d/%d done, %d remaining\n" \
			"${deleted}" "${failed}" "${batch_count}" "${#TO_DELETE[@]}" "${remaining}"
		separator
		read -rp "  Continue with next batch? [Y/n] " cont
		if [[ "${cont,,}" == "n" ]]; then
			echo ""
			echo "Stopped by user after ${batch_count} images processed."
			break
		fi
		echo ""
	fi
done

# ── Final summary ─────────────────────────────────────────────────────────────

echo ""
separator
printf "  Done — %d deleted, %d failed | %d/%d total processed\n" \
	"${deleted}" "${failed}" "${batch_count}" "${#TO_DELETE[@]}"
separator
