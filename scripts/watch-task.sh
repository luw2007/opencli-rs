#!/bin/bash

INDEX=${1:-1}
INTERVAL=${2:-2}

echo "监控任务 $INDEX 的对话内容（每 ${INTERVAL} 秒刷新，按 Ctrl+C 退出）..."
echo "============================================================"

while true; do
    clear
    echo "最后更新: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "============================================================"
    opencli-rs trae-cn task-info "$INDEX"
    echo ""
    echo "============================================================"
    echo "下次刷新: ${INTERVAL} 秒后 (按 Ctrl+C 退出)"
    sleep "$INTERVAL"
done
