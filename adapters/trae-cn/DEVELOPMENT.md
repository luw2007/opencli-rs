# Trae CN 适配器开发指南

## 🎯 快速开始

### 1. 设置 CDP 连接

```bash
# 方法 1: 使用开发脚本
./dev-trae.sh update

# 方法 2: 手动设置
export OPENCLI_CDP_ENDPOINT="ws://localhost:9222/devtools/page/<PAGE_ID>"
```

### 2. 测试连接

```bash
./dev-trae.sh test
```

## 📋 已发现的 DOM 结构

### 输入框

**主要输入框（Lexical 编辑器）**
```css
.chat-input-v2-input-box-editable
[contenteditable="true"]
[data-lexical-editor="true"]
```

**属性**:
- `class="chat-input-v2-input-box-editable"`
- `contenteditable="true"`
- `role="textbox"`
- `spellcheck="true"`
- `data-lexical-editor="true"`

### 消息容器

**消息元素**:
```css
.message
[class*="message"]
[class*="chat-message"]
```

**注意**: 消息元素没有明确的 `data-message-role` 属性，需要通过其他方式区分用户和助手消息。

## 🔧 开发工具

### 可用的调试命令

```bash
# 检查连接状态
./dev-trae.sh status

# 查找输入框
./dev-trae.sh find-input

# 查找消息元素
./dev-trae.sh find-messages

# 详细 DOM 探查
./dev-trae.sh debug-dom ".chat-input-v2-input-box-editable"

# 读取对话历史
./dev-trae.sh read

# 发送文本
./dev-trae.sh send "你好"

# 发送问题并等待回复
./dev-trae.sh ask "如何使用 Rust?"
```

### 直接使用 opencli-rs

```bash
export OPENCLI_CDP_ENDPOINT="ws://localhost:9222/devtools/page/<PAGE_ID>"

# 查看所有命令
./target/debug/opencli-rs trae-cn --help

# DOM 探查
./target/debug/opencli-rs trae-cn dom-inspect "body"
./target/debug/opencli-rs trae-cn find-input
./target/debug/opencli-rs trae-cn find-messages
./target/debug/opencli-rs trae-cn debug-dom ".selector"
```

## 🎨 优化适配器配置

### 更新输入框选择器

基于发现的 DOM 结构，更新 `send.yaml` 和 `ask.yaml`:

```yaml
# 查找输入框
let editor = document.querySelector('.chat-input-v2-input-box-editable, [data-lexical-editor="true"]');
```

### 更新消息选择器

需要进一步探查消息容器的结构，找到区分用户和助手消息的方法。

## 📝 开发流程

### 1. 探查 DOM

```bash
# 查找特定元素
./target/debug/opencli-rs trae-cn debug-dom ".selector"

# 或使用通用探查
./target/debug/opencli-rs trae-cn dom-inspect ".selector"
```

### 2. 更新适配器

编辑对应的 YAML 文件:
```bash
vim adapters/trae-cn/send.yaml
```

### 3. 重新编译

```bash
cargo build
```

### 4. 测试

```bash
./dev-trae.sh test
```

## ⚠️ 注意事项

1. **不要关闭页面**: 代码已修改，不会自动关闭 Electron 应用页面
2. **CDP endpoint 会变化**: 每次重启 Trae 后，需要更新 endpoint
3. **选择器可能变化**: Trae 更新后，DOM 结构可能变化，需要重新探查

## 🔍 调试技巧

### 1. 使用浏览器开发者工具

在 Trae 中打开开发者工具（通常是 Cmd+Option+I），可以直接测试选择器：

```javascript
// 测试选择器
document.querySelector('.chat-input-v2-input-box-editable')

// 查看元素属性
console.log(element.attributes)
```

### 2. 逐步调试

```bash
# 1. 检查连接
./dev-trae.sh status

# 2. 查找元素
./dev-trae.sh find-input

# 3. 测试读取
./dev-trae.sh read

# 4. 测试发送
./dev-trae.sh send "test"
```

### 3. 查看详细错误

```bash
# 启用详细日志
OPENCLI_VERBOSE=1 ./target/debug/opencli-rs trae-cn send "test"
```

## 📚 参考资源

- [opencli-rs 文档](../README.md)
- [适配器开发指南](../prompts/generate-adapter.md)
- [Cursor 适配器示例](../adapters/cursor/)
- [CDP 协议文档](https://chromedevtools.github.io/devtools-protocol/)

## 🚀 下一步

1. ✅ 已完成基础适配器配置
2. ✅ 已找到输入框选择器
3. ⏳ 需要优化消息读取（找到区分用户/助手的方法）
4. ⏳ 需要测试所有命令
5. ⏳ 需要根据实际使用情况调整选择器

## 💡 提示

- 使用 `./dev-trae.sh` 脚本可以简化开发流程
- 每次修改适配器后需要重新编译
- 如果命令失败，先检查 CDP endpoint 是否正确
- 可以在浏览器开发者工具中验证选择器是否正确
