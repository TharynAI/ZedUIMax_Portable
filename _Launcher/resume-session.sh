#!/bin/bash
# ZedUI Session Resume Script
# Called by ZedUI to resume a Claude session in Windows Terminal

# Arguments
TARGET_DIR="$1"
SESSION_ID="$2"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validate arguments
if [ -z "$TARGET_DIR" ]; then
    echo -e "${RED}✗ No target directory specified${NC}"
    exit 1
fi

if [ -z "$SESSION_ID" ]; then
    echo -e "${RED}✗ No session ID specified${NC}"
    exit 1
fi

# Change to target directory
cd "$TARGET_DIR" || {
    echo -e "${RED}✗ Cannot change to directory: $TARGET_DIR${NC}"
    exit 1
}

echo -e "${GREEN}Resuming session: ${SESSION_ID}${NC}"
echo -e "${YELLOW}Working directory: $TARGET_DIR${NC}"
echo ""

# Set environment and launch Claude
export CLAUDE_ALLOW_ROOT_BYPASS=1
export CLAUDE_DISABLE_UPDATES=1

CLAUDE_PATH="/mnt/e/ZedBang/CLI/Cust/Claude2/node_modules/.bin/claude"
MCP_CONFIG="/mnt/e/ZedBang/CLI/Cust/Claude2/claude2.mpcSet.json"

# Launch Claude with resume flag
"$CLAUDE_PATH" --permission-mode bypassPermissions --mcp-config "$MCP_CONFIG" --resume "$SESSION_ID"

# Preserve exit code
EXIT_CODE=$?

echo -e "\n${YELLOW}Claude2 session ended (exit code: $EXIT_CODE)${NC}"

exit $EXIT_CODE
