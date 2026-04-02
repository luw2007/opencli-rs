# Trae CN 任务列表查看指南

## 📋 快速查看任务列表

### 方法 1: 使用开发脚本（推荐）

```bash
# 查看所有任务
./dev-trae.sh tasks

# 创建新任务
./dev-trae.sh task-new "任务标题"

# 查看特定任务详情
./dev-trae.sh task-detail 1
```

### 方法 2: 直接使用 opencli-rs

```bash
# 设置环境变量
export OPENCLI_CDP_ENDPOINT="ws://localhost:9222/devtools/page/<PAGE_ID>"

# 查看任务列表
./target/debug/opencli-rs trae-cn tasks

# 创建新任务
./target/debug/opencli-rs trae-cn task-new "任务标题"

# 查看任务详情
./target/debug/opencli-rs trae-cn task-detail 1
```

## 📊 输出示例

```
+-------+--------+--------------------------------+-------+
| Index | Status | Title                          | Time  |
+=========================================================+
| 1     | 进行中 | 触发键盘操作 Ctrl+Command+N    | 08:46 |
| 2     | 待处理 | 触发键盘操作 Ctrl+Command+N    | -     |
| 5     | 进行中 | 新增 Electron 工具             | 08:44 |
| 9     | 已完成 | 查看 Electron CDP 开启状态任务 | 08:33 |
+-------+--------+--------------------------------+-------+
```

## 🎯 任务状态说明

- **进行中**: 当前正在执行的任务
- **已完成**: 已经完成的任务
- **待处理**: 等待执行的任务

## 🔍 任务详情

查看特定任务的详细信息：

```bash
./dev-trae.sh task-detail 1
```

输出包含：
- 任务索引
- 任务状态
- 完整文本
- CSS 类名
- 子元素数量
- HTML 结构

## 🛠️ DOM 结构

### 新建任务按钮

```css
.index-module__new-task-button___zhUKB
[class*="new-task-button"]
```

快捷键提示：`⌃⌘N`（Ctrl+Command+N）

### 任务列表容器

```css
.index-module__task-items-list___VBFD2
[class*="task-items-list"]
```

### 任务项

```css
.index-module__task-item___zOpfg
[class*="task-item"]
```

### 选中状态

```css
.index-module__selected___VDArP
.selected
```

## 💡 使用技巧

1. **快速定位进行中的任务**: 查看状态为"进行中"的任务
2. **查看任务历史**: 查看状态为"已完成"的任务和时间
3. **调试任务**: 使用 `task-detail` 查看任务的详细信息
4. **快速创建任务**: 使用 `task-new` 命令或快捷键 `Ctrl+Command+N` 创建新任务
5. **批量管理**: 结合 `tasks`、`task-new` 和 `task-detail` 命令进行任务管理

## 📝 命令参数

### tasks 命令

无参数，直接显示所有任务列表。

### task-new 命令

创建新任务：

```bash
./dev-trae.sh task-new [title]
```

参数：
- `title`: 任务标题（可选）

示例：
```bash
./dev-trae.sh task-new                    # 点击新建任务按钮
./dev-trae.sh task-new "实现新功能"       # 创建指定标题的任务
```

快捷键：`Ctrl+Command+N`（⌃⌘N）

### task-detail 命令

```bash
./dev-trae.sh task-detail <index>
```

参数：
- `index`: 任务索引（从 1 开始）

示例：
```bash
./dev-trae.sh task-detail 1   # 查看第一个任务
./dev-trae.sh task-detail 5   # 查看第五个任务
```

## 🔧 自定义

如果需要自定义任务显示，可以编辑配置文件：

```bash
vim adapters/trae-cn/tasks.yaml
vim adapters/trae-cn/task-detail.yaml
```

修改后重新编译：

```bash
cargo build
```

## 📚 相关命令

- `status` - 检查连接状态
- `read` - 读取对话历史
- `history` - 查看会话历史记录
- `tasks` - 查看任务列表
- `task-new` - 创建新任务
- `task-detail` - 查看任务详情
- `dom-inspect` - DOM 探查工具
