#!/bin/bash

# Trae CN 开发调试脚本
# 使用方法: ./dev-trae.sh [command]

# 设置 CDP endpoint
export OPENCLI_CDP_ENDPOINT="ws://localhost:9222/devtools/page/B0099CFEE4ACD3D57B39EF55A4CB256B"

# 获取最新的页面 ID
get_page_id() {
    curl -s http://localhost:9222/json/list | \
    grep -A 5 '"type": "page"' | \
    grep '"id"' | \
    head -1 | \
    sed 's/.*"id": "\([^"]*\)".*/\1/'
}

# 自动更新 CDP endpoint
update_endpoint() {
    local page_id=$(get_page_id)
    if [ -n "$page_id" ]; then
        export OPENCLI_CDP_ENDPOINT="ws://localhost:9222/devtools/page/$page_id"
        echo "Updated CDP endpoint: $OPENCLI_CDP_ENDPOINT"
    else
        echo "Failed to get page ID"
        exit 1
    fi
}

# 主命令
case "${1:-help}" in
    status)
        ./target/debug/opencli-rs trae-cn status
        ;;
    send)
        shift
        ./target/debug/opencli-rs trae-cn send "$@"
        ;;
    ask)
        shift
        ./target/debug/opencli-rs trae-cn ask "$@"
        ;;
    read)
        ./target/debug/opencli-rs trae-cn read
        ;;
    new)
        ./target/debug/opencli-rs trae-cn new
        ;;
    model)
        ./target/debug/opencli-rs trae-cn model
        ;;
    history)
        ./target/debug/opencli-rs trae-cn history
        ;;
    dump)
        ./target/debug/opencli-rs trae-cn dump
        ;;
    export)
        ./target/debug/opencli-rs trae-cn export
        ;;
    extract-code)
        shift
        ./target/debug/opencli-rs trae-cn extract-code "$@"
        ;;
    tasks)
        ./target/debug/opencli-rs trae-cn tasks
        ;;
    task-detail)
        shift
        ./target/debug/opencli-rs trae-cn task-detail "$@"
        ;;
    update)
        update_endpoint
        ;;
    build)
        cargo build
        ;;
    test)
        echo "Testing connection..."
        ./target/debug/opencli-rs trae-cn status
        echo ""
        echo "Testing read..."
        ./target/debug/opencli-rs trae-cn read | head -20
        ;;
    help|*)
        echo "Trae CN 开发调试脚本"
        echo ""
        echo "使用方法: $0 [command]"
        echo ""
        echo "可用命令:"
        echo "  status       - 检查连接状态"
        echo "  send <text>  - 发送文本"
        echo "  ask <text>   - 发送问题并等待回复"
        echo "  read         - 读取对话历史"
        echo "  new          - 创建新会话"
        echo "  model        - 查看当前模型"
        echo "  history      - 查看历史记录"
        echo "  dump         - 导出完整数据"
        echo "  export       - 导出为 Markdown"
        echo "  extract-code - 提取代码块"
        echo "  tasks        - 查看任务列表"
        echo "  task-detail  - 查看任务详情"
        echo "  update       - 更新 CDP endpoint"
        echo "  build        - 重新编译"
        echo "  test         - 测试连接和基本功能"
        echo "  help         - 显示帮助信息"
        ;;
esac
