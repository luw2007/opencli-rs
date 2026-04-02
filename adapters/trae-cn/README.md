# Trae CN 适配器 - 快速开始

## 🚀 一键开始

```bash
# 1. 更新 CDP endpoint
./dev-trae.sh update

# 2. 测试连接
./dev-trae.sh test

# 3. 开始使用
./dev-trae.sh ask "你好，请介绍一下你自己"
```

## 📋 可用命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `status` | 检查连接状态 | `./dev-trae.sh status` |
| `send` | 发送文本 | `./dev-trae.sh send "你好"` |
| `ask` | 发送问题并等待回复 | `./dev-trae.sh ask "如何使用 Rust?"` |
| `read` | 读取对话历史 | `./dev-trae.sh read` |
| `new` | 创建新会话 | `./dev-trae.sh new` |
| `model` | 查看当前模型 | `./dev-trae.sh model` |
| `history` | 查看历史记录 | `./dev-trae.sh history` |

## 🔧 开发调试

```bash
# 查找输入框元素
./dev-trae.sh find-input

# 查找消息元素
./dev-trae.sh find-messages

# 详细 DOM 探查
./target/debug/opencli-rs trae-cn debug-dom ".selector"

# 重新编译
./dev-trae.sh build
```

## ⚙️ 环境变量

```bash
# 设置 CDP endpoint
export OPENCLI_CDP_ENDPOINT="ws://localhost:9222/devtools/page/<PAGE_ID>"

# 启用详细日志
export OPENCLI_VERBOSE=1

# 设置超时时间（秒）
export OPENCLI_BROWSER_COMMAND_TIMEOUT=120
```

## 📁 文件结构

```
adapters/trae-cn/
├── status.yaml          # 检查连接状态
├── send.yaml            # 发送文本
├── ask.yaml             # 发送问题并等待回复
├── read.yaml            # 读取对话历史
├── new.yaml             # 创建新会话
├── model.yaml           # 查看当前模型
├── history.yaml         # 历史记录列表
├── dump.yaml            # 导出完整数据
├── export.yaml          # 导出为 Markdown
├── extract-code.yaml    # 提取代码块
├── dom-inspect.yaml     # DOM 探查工具
├── find-input.yaml      # 查找输入框
├── find-messages.yaml   # 查找消息元素
├── debug-dom.yaml       # 详细 DOM 探查
├── DEVELOPMENT.md       # 开发指南
└── README.md            # 本文件
```

## 🎯 已发现的 DOM 结构

### 输入框
```css
.chat-input-v2-input-box-editable  /* 主要输入框 */
[data-lexical-editor="true"]        /* Lexical 编辑器标识 */
[contenteditable="true"]            /* 可编辑属性 */
```

### 消息容器
```css
.message                            /* 消息元素 */
[class*="message"]                  /* 包含 message 的类 */
[class*="chat-message"]             /* 聊天消息 */
```

## ⚠️ 注意事项

1. **不要关闭 Trae**: 代码已修改，不会自动关闭 Electron 应用
2. **CDP endpoint 会变化**: 重启 Trae 后需要更新 endpoint
3. **选择器可能变化**: Trae 更新后可能需要重新探查 DOM

## 📚 更多信息

详细开发指南请查看 [DEVELOPMENT.md](./DEVELOPMENT.md)
