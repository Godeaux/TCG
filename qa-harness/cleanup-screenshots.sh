#!/bin/bash
# Delete screenshots older than 3 days
find /Users/nut/.openclaw/workspace/projects/food-chain-tcg/qa-harness/screenshots -name "*.png" -mtime +3 -delete
echo "Cleaned screenshots older than 3 days"
