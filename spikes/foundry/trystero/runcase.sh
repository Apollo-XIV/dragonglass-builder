#!/usr/bin/env bash
# THROWAWAY: runcase.sh <label> <keyA> <keyB> <queryExtraA> <queryExtraB> [wait]
l=$1; w=${6:-30}
curl -s -X POST localhost:8765/log -d "{\"who\":\"---\",\"msg\":\"CASE $l\"}" >/dev/null
P1=$(mktemp -d); P2=$(mktemp -d)
firefox --headless --no-remote --profile $P1 "http://127.0.0.1:8765/page-nostr.html?role=vault&key=$2&who=A&waitMs=$((w*1000))$4" >/dev/null 2>&1 & A=$!
sleep 3
firefox --headless --no-remote --profile $P2 "http://127.0.0.1:8765/page-nostr.html?role=foundry&key=$3&who=B&waitMs=$((w*1000))$5" >/dev/null 2>&1 & B=$!
sleep $((w+6)); pkill -P $A; pkill -P $B; kill $A $B 2>/dev/null
