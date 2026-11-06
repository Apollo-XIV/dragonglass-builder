#!/usr/bin/env bash
# THROWAWAY: runpair.sh <strategy> -> two headless Firefox peers on this machine.
s=$1; K=$(head -c 12 /dev/urandom | base64 | tr -dc a-z0-9 | head -c 12)cccccccc
curl -s -X POST localhost:8765/log -d "{\"who\":\"---\",\"msg\":\"STRATEGY $s\"}" >/dev/null
P1=$(mktemp -d); P2=$(mktemp -d)
firefox --headless --no-remote --profile $P1 "http://127.0.0.1:8765/page-$s.html?role=vault&key=$K&who=ff-$s-A&waitMs=30000" >/dev/null 2>&1 & A=$!
sleep 3
firefox --headless --no-remote --profile $P2 "http://127.0.0.1:8765/page-$s.html?role=foundry&key=$K&who=ff-$s-B&waitMs=30000" >/dev/null 2>&1 & B=$!
sleep 36
pkill -P $A; pkill -P $B; kill $A $B 2>/dev/null
