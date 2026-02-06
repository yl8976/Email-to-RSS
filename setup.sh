#!/usr/bin/env bash

set -euo pipefail

echo "🚀 Setting up Email to RSS service..."

if ! command -v npm >/dev/null 2>&1 || ! command -v npx >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
  echo "❌ Error: Node.js (with npm and npx) is required but not found."
  echo "Install Node.js from https://nodejs.org/en/download/ and run setup again."
  exit 1
fi

if [ ! -f "wrangler-example.toml" ]; then
  echo "❌ Error: wrangler-example.toml not found."
  exit 1
fi

WORKER_NAME="$(grep -E '^name = "' wrangler-example.toml | head -1 | cut -d'"' -f2)"
if [ -z "$WORKER_NAME" ]; then
  WORKER_NAME="email-to-rss"
fi

echo "📦 Installing dependencies..."
npm install

echo "🔒 Checking Cloudflare authentication..."
set +e
WHOAMI_OUTPUT="$(npx wrangler whoami 2>&1)"
WHOAMI_STATUS=$?
set -e
if [ "$WHOAMI_STATUS" -ne 0 ] || echo "$WHOAMI_OUTPUT" | grep -qi "not authenticated"; then
  echo "❌ You are not logged in to Cloudflare. Please run:"
  echo "npx wrangler login"
  echo "After login completes, run this setup script again."
  exit 1
fi
echo "✅ Cloudflare authentication verified"

extract_namespace_ids_from_json() {
  local worker_name="$1"
  node - "$worker_name" <<'NODE'
const fs = require("node:fs");
const workerName = process.argv[2];

let namespaces;
try {
  namespaces = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

if (!Array.isArray(namespaces)) {
  process.exit(0);
}

const findByTitle = (title) => {
  const match = namespaces.find((namespace) => namespace?.title === title && typeof namespace?.id === "string");
  return match?.id ?? "";
};

const mainId = findByTitle(`${workerName}-EMAIL_STORAGE`);
const previewId = findByTitle(`${workerName}-EMAIL_STORAGE_preview`);
process.stdout.write(`${mainId}\n${previewId}`);
NODE
}

get_kv_namespace_ids() {
  echo "🔍 Retrieving KV namespace IDs..."

  local output
  if ! output="$(npx wrangler kv namespace list --json 2>/dev/null)"; then
    echo "❌ Error listing KV namespaces. Please check your Cloudflare authentication."
    return 1
  fi

  local ids
  ids="$(printf '%s' "$output" | extract_namespace_ids_from_json "$WORKER_NAME")"
  MAIN_ID="$(printf '%s\n' "$ids" | sed -n '1p')"
  PREVIEW_ID="$(printf '%s\n' "$ids" | sed -n '2p')"

  if [ -z "$MAIN_ID" ] || [ -z "$PREVIEW_ID" ]; then
    MAIN_ID="$(echo "$output" | grep -o '"id": *"[^"]*"' | head -1 | cut -d'"' -f4)"
    PREVIEW_ID="$(echo "$output" | grep -o '"id": *"[^"]*"' | head -2 | tail -1 | cut -d'"' -f4)"
  fi

  if [ -z "$MAIN_ID" ] || [ -z "$PREVIEW_ID" ]; then
    echo "❌ Failed to extract KV namespace IDs. Please run manually:"
    echo "npx wrangler kv namespace list"
    echo "And update the IDs in wrangler.toml"
    return 1
  fi

  return 0
}

echo "🗄️ Creating KV namespaces..."
npx wrangler kv namespace create EMAIL_STORAGE >/dev/null 2>&1 || true
npx wrangler kv namespace create EMAIL_STORAGE --preview >/dev/null 2>&1 || true

if ! get_kv_namespace_ids; then
  echo "❌ Setup cannot continue without KV namespace IDs."
  exit 1
fi

echo "📊 KV Namespace Status:"
echo "  ✅ Main KV namespace ID: $MAIN_ID"
echo "  ✅ Preview KV namespace ID: $PREVIEW_ID"

echo "🔐 Setting up admin password..."
read -r -p "Enter admin password: " admin_password
if [ -z "$admin_password" ]; then
  echo "❌ No admin password provided."
  exit 1
fi

set +e
SECRET_OUTPUT="$(printf '%s' "$admin_password" | npx wrangler secret put ADMIN_PASSWORD --env production --name "$WORKER_NAME" 2>&1)"
SECRET_STATUS=$?
set -e
if [ "$SECRET_STATUS" -ne 0 ]; then
  echo "❌ Failed to set admin password for production environment"
  echo "Error: $SECRET_OUTPUT"
  exit 1
fi
echo "✅ Admin password set for production environment"

read -r -p "Enter your domain (e.g., yourdomain.com): " domain
domain="${domain#https://}"
domain="${domain#http://}"
domain="${domain%%/*}"
if [ -z "$domain" ]; then
  echo "❌ No domain provided. Cannot continue."
  exit 1
fi
echo "✅ Domain: $domain"

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

KV_ID_ESCAPED="$(escape_sed_replacement "$MAIN_ID")"
KV_PREVIEW_ID_ESCAPED="$(escape_sed_replacement "$PREVIEW_ID")"
DOMAIN_ESCAPED="$(escape_sed_replacement "$domain")"
COMPATIBILITY_DATE_ESCAPED="$(escape_sed_replacement "$(date +%F)")"

echo "📝 Creating and configuring wrangler.toml..."
cp wrangler-example.toml wrangler.toml

if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/REPLACE_WITH_YOUR_DOMAIN/$DOMAIN_ESCAPED/g" wrangler.toml
  sed -i '' "s/REPLACE_WITH_YOUR_KV_NAMESPACE_ID/$KV_ID_ESCAPED/g" wrangler.toml
  sed -i '' "s/REPLACE_WITH_YOUR_PREVIEW_KV_NAMESPACE_ID/$KV_PREVIEW_ID_ESCAPED/g" wrangler.toml
  sed -i '' "s/REPLACE_WITH_COMPATIBILITY_DATE/$COMPATIBILITY_DATE_ESCAPED/g" wrangler.toml
else
  sed -i "s/REPLACE_WITH_YOUR_DOMAIN/$DOMAIN_ESCAPED/g" wrangler.toml
  sed -i "s/REPLACE_WITH_YOUR_KV_NAMESPACE_ID/$KV_ID_ESCAPED/g" wrangler.toml
  sed -i "s/REPLACE_WITH_YOUR_PREVIEW_KV_NAMESPACE_ID/$KV_PREVIEW_ID_ESCAPED/g" wrangler.toml
  sed -i "s/REPLACE_WITH_COMPATIBILITY_DATE/$COMPATIBILITY_DATE_ESCAPED/g" wrangler.toml
fi

echo "✅ wrangler.toml has been created and configured successfully!"
echo ""
echo "✅ Setup complete! Next steps:"
echo "1. Set up MX records for your domain with ForwardEmail.net (see README for details)"
echo "2. Deploy with 'npm run deploy'"
