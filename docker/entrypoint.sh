#!/bin/sh
# Bootstrap an isolated DSH profile containing dsh-base + dsh-plugin-lightnovel,
# then exec the real dsh CLI with the caller's arguments.
set -eu

PLUGIN_ROOT=/opt/lightnovel
PROFILE_DIR="${DSH_HOME}/profiles/nas"
CLI="${PLUGIN_ROOT}/node_modules/@deepseek-ai/dsh/lib/bin.js"

mkdir -p "${PROFILE_DIR}/node_modules/@deepseek-ai" \
         "${LN_DATA_DIR:-/data}/library" \
         "${LN_DATA_DIR:-/data}/tasks" \
         "${LN_DATA_DIR:-/data}/logs" \
         "${LN_DATA_DIR:-/data}/index"

if [ ! -f "${PROFILE_DIR}/package.json" ]; then
  cat > "${PROFILE_DIR}/package.json" <<EOF
{
  "name": "dsh-profile-nas",
  "private": true,
  "type": "module",
  "dependencies": {
    "@deepseek-ai/dsh-base": "0.2.2-rc.1",
    "dsh-plugin-lightnovel": "link:${PLUGIN_ROOT}"
  },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "dsh-plugin-lightnovel"] } }
}
EOF
fi

# A profile patch layer MUST be a top-level YAML array.
[ -f "${PROFILE_DIR}/cordis.patch.yml" ] || printf '[]\n' > "${PROFILE_DIR}/cordis.patch.yml"

[ -e "${PROFILE_DIR}/node_modules/dsh-plugin-lightnovel" ] \
  || ln -s "${PLUGIN_ROOT}" "${PROFILE_DIR}/node_modules/dsh-plugin-lightnovel"
[ -e "${PROFILE_DIR}/node_modules/@deepseek-ai/dsh-base" ] \
  || ln -s "${PLUGIN_ROOT}/node_modules/@deepseek-ai/dsh-base" "${PROFILE_DIR}/node_modules/@deepseek-ai/dsh-base"

echo "[lightnovel] DSH_HOME=${DSH_HOME} dart=${LN_DART_BINARY:-auto} data=${LN_DATA_DIR:-/data}" >&2
exec node "${CLI}" "$@"
