# Technical Evidence

Obsidian 的按需技术证据插件。技术文档可以完整解释机制与过程，点击链接后在浮动面板中查看支撑结果的代码、调用链、数据和推导，关闭后继续原位置阅读。正文不要求简短，面板用于方便追查依据。

## 安装

需要 Obsidian 1.8.0 或更新版本。

```sh
npm install
npm test
npm run package
```

将生成的 `release/technical-evidence/` 文件夹复制到目标仓库的 `.obsidian/plugins/` 下，然后在 Obsidian 社区插件列表中启用 **Technical Evidence**。文件夹中必须包含 `main.js`、`manifest.json` 和 `styles.css`。

也可以解压 `release/technical-evidence-0.1.0.zip` 到 `.obsidian/plugins/`。修改源码后重新构建、复制并重新加载插件。

## 快速体验

将 `examples/` 中的 `主文档.md` 和 `Evidence/` 复制到 Obsidian 仓库根目录，打开主文档。示例中的代码、汇编与数据均为演示数据。

```markdown
**结论：** 示例函数最多接受 4096 字节。

超过上限时，在复制前返回错误。

[查看调用链](callchain:Evidence/evidence.json#buffer-limit)
[查看证据](evidence:Evidence/evidence.json#buffer-limit)
```

- **阅读视图：** 点击链接打开弹窗。
- **实时预览：** 光标不在链接内时显示可点击文字，点击打开弹窗；光标进入链接时显示原始 Markdown，便于编辑。普通标签采用文字链接样式，行内代码标签保持代码外观，均不显示按钮外框。
- **源码模式：** 保留原始 Markdown，不提供弹窗入口。实时预览中包住完整链接的行内代码、代码块和注释不会转换为可点击入口。

弹窗支持切换“结论依据”和“函数调用链”、代码高亮、显示来源、关键参数，以及刷新文件。调用图中的箭头表示“调用者 → 被调用者”；点击函数节点查看代码和调用条件，键盘也可以用 Tab、Enter 和空格操作。循环调用、递归、分支和独立节点均可展示。

调用图和 Markdown 证据中的 Mermaid 流程图默认适应面板宽度，提供 **− / + / 适应宽度 / 重置** 按钮，并显示当前缩放比例。缩放范围为 5%–300%，重置恢复到 100%。放大后在图形区域内滚动查看，不会撑宽浮动面板或改变正文、代码的字号。适应宽度模式会随窗口变化重新计算，手动缩放后保持所选比例。

图形区域内直接使用 **滚轮**，以鼠标位置为中心缩放；**按住鼠标左键拖动**可平移画布，适应宽度或缩小后也可拖动。点击函数节点仍可查看代码，拖动后不会误触节点；松开左键即停止移动。图形外的滚轮继续用于阅读正文。聚焦图形区域后可使用 `+` / `-` 缩放，`0` 重置。窄面板内的按钮会换行，长函数名会换行，代码保留缩进并在代码块内横向滚动。

面板默认位于窗口右侧，宽 440px、高度最多 760px，采用竖长布局并适配较小窗口。拖动顶部标题栏可移动面板，移动范围限制在窗口内；也可聚焦标题后用方向键移动，按住 Shift 微调。窗口大小改变时会调整位置，避免面板移出可见区域。

按住鼠标左键拖动面板的四条边或四个角，可调整宽度和高度，右下角有缩放标记。正常窗口下最小尺寸为 320×240px，最大范围限制在窗口内；较小窗口会相应缩小尺寸限制。调整仅在本次面板打开期间有效，关闭后再次打开同一证据也恢复默认尺寸，不保存到插件设置。

浮动面板没有遮罩，打开时仍可点击和编辑正文；点击面板外部会保持面板打开。点击右上角关闭按钮，或在面板内按 Esc 关闭。默认不自动修改主文档，也不自动生成技术结论。

面板中的 Markdown 笔记链接和证据链接默认在当前面板继续打开，使用“← 返回”回到上一条证据并恢复内容滚动位置。按住 Ctrl/Command/Shift 等修饰键点击会保留原有操作；外部 URL 和附件也保留 Obsidian 原有行为。缺失笔记只提示错误，不会由插件创建新笔记。宽表格在表格内部横向滚动。

## 引用规则

| 用途 | Markdown 示例 |
| --- | --- |
| JSON 条目依据 | `[查看证据](evidence:Evidence/evidence.json#buffer-limit)` |
| 同一条目的调用链 | `[查看调用链](callchain:Evidence/evidence.json#buffer-limit)` |
| 默认 JSON 数据库 | `[查看证据](evidence:#buffer-limit)` |
| 整篇 Markdown | `[查看证据](evidence:Evidence/详细证据.md)` |
| Markdown 标题 | `[查看证据](evidence:Evidence/详细证据.md#长度上限)` |
| Markdown 块 | `[查看证据](evidence:Evidence/详细证据.md#^boundary)` |
| 从仓库根目录定位 | `[查看证据](evidence:/Evidence/evidence.json#buffer-limit)` |
| 明确相对当前笔记 | `[查看证据](evidence:../Evidence/evidence.json#buffer-limit)` |

默认数据库为仓库根目录的 `Evidence/evidence.json`，可在插件设置中修改。链接中的路径会先相对当前笔记目录查找，再从仓库根目录查找；`/` 开头仅从根目录查找，`./` 和 `../` 开头仅相对当前笔记查找。路径区分大小写的仓库需使用实际文件名。

函数名可以直接作为链接文字，并保留行内代码格式，无需额外添加“查看调用链”按钮：

```markdown
设备助手的升级流程以 [`G12_RCService`](callchain:Evidence/upgrade.json#G12_RCService) 为条目名。
```

阅读视图和实时预览均显示可点击的代码文字 `G12_RCService`。示例中的文件路径与条目 ID 需要替换为实际证据位置；JSON 条目应包含 `callChain`。`evidence:` 同样支持这种写法。反引号放在方括号内，只包住显示文字，不包住整个链接。

带空格的路径或标题需要 URL 编码，或使用尖括号：

```markdown
[查看证据](evidence:Evidence/My%20Evidence.md#Length%20limit)
[查看证据](<evidence:Evidence/My Evidence.md#Length limit>)
```

路径或 ID 中的 `#`、`%`、括号等特殊字符也应 URL 编码。JSON 条目 ID 区分大小写。只允许当前仓库内的 `.json` 与 `.md` 文件，不读取外部 URL 或仓库外文件。

Markdown 使用 Obsidian 原生渲染器，可包含表格、图片、公式、callout 和 Mermaid；相对资源链接以证据文件所在目录为基准。Markdown 标题和块由 Obsidian 索引定位，新建文件后可能需稍候再打开。标题引用包含该标题下的子标题内容，块引用显示指定块。

这是插件自定义的链接协议。正文笔记之间的普通关联仍可使用 Obsidian 的 `[[双向链接]]`。关闭插件后，这些证据链接将保留为文本链接，不再弹窗。Obsidian 不会自动维护自定义协议内的文件路径，重命名或移动证据文件时应同步更新引用。

## JSON 结构

```json
{
  "version": 1,
  "records": {
    "buffer-limit": {
      "title": "请求长度限制",
      "summary": "超过 4096 字节时返回错误。",
      "parameters": { "maxBytes": 4096 },
      "evidence": [
        {
          "title": "反编译代码",
          "kind": "code",
          "language": "c",
          "source": "sample.bin · 函数地址 0x401000",
          "content": "if (length > 4096) return -1;"
        },
        {
          "title": "推导",
          "kind": "markdown",
          "content": "比较使用严格大于，因此等于上限仍被接受。"
        }
      ],
      "callChain": {
        "nodes": [
          { "id": "handle", "label": "handle_request", "language": "c", "code": "validate_length(length);" },
          { "id": "validate", "label": "validate_length", "language": "c", "code": "return length <= 4096;" }
        ],
        "edges": [
          { "from": "handle", "to": "validate", "label": "检查长度" }
        ]
      }
    }
  }
}
```

`version: 1`、`records` 和每条记录的 `title` 必填；每条记录至少包含 `evidence` 或 `callChain`，两者可以同时存在。

| 字段 | 说明 |
| --- | --- |
| `summary` | 可选的简短说明，按纯文本展示 |
| `assessment` | 可选的证据等级、分析依据、适用范围、复核情况与限制，见下文 |
| `parameters` | 可选的键值表，值为字符串、数值或布尔值 |
| `evidence[].title` / `content` | 必填的段落标题与正文字符串 |
| `evidence[].kind` | 必填；`markdown` 渲染 Markdown，`code` 展示代码，`data` 展示数据代码块 |
| `language` | 可选的代码语言，如 `c`、`asm`、`python`、`json`；`data` 默认 `json`，不强制其内容为有效 JSON |
| `source` | 可选的来源说明，按纯文本展示；不会自动读取该地址的代码 |
| `callChain.nodes` / `edges` | 必填数组；节点需有唯一的非空 `id` 和 `label`，边需有存在的 `from` / `to` |
| `nodes[].description` / `code` | 可选的函数说明与代码字符串 |
| `edges[].label` | 可选的调用条件或关系说明，在选中调用者时展示 |

详细 JSON 示例见 `examples/Evidence/evidence.json`。数据库按点击读取并解析，不会在渲染每篇主文档时加载全部证据；单个 JSON 文件每次打开仍需完整读取和解析，大型资料建议按主题拆分文件。它是本地 JSON 文件存储，不包含 SQL 服务、检索服务或反编译工具。

### 证据等级与复核范围

复杂技术报告可在 JSON 条目中增加以下可选字段，避免把“静态机制已确认”误读成“实机已执行”：

```json
{
  "assessment": {
    "status": "confirmed",
    "basis": "static",
    "scope": "仅适用于已分析的样本版本与指定代码路径",
    "review": "沿用历史静态记录，本轮未重新核验",
    "limitations": ["没有运行日志", "没有验证物理接线"]
  }
}
```

`status` 必填于 `assessment` 内，可用 `confirmed`、`inferred`、`partial`、`unknown`；`basis` 可选 `static`、`runtime`、`mixed`、`unverified`。`scope`、`review` 为可选字符串，`limitations` 为可选字符串数组。字段由作者显式填写，插件不会从文字猜测或升级证据等级；旧条目可完全省略 `assessment`。使用独立 Markdown 证据文件时，可继续用原有 callout/文字说明证据范围。

已有 `protocol` 等其他插件的代码块可以保留在 Markdown 中，由 Obsidian 原生渲染流程调用对应的处理器；Technical Evidence 不内置这些处理器，也不会将字段协议改写成源码。插件展示与导航已整理的证据，不会自动重写整篇报告或根据函数地址生成缺失的反编译内容。

## 编辑与开发

命令面板提供“插入证据链接”和“插入调用链链接”：先选中条目 ID，再运行命令，就会插入使用默认数据库的链接。未选中时使用 `条目ID` 占位符。

```sh
npm run dev      # 持续构建
npm run check    # TypeScript 检查
npm test         # 自动化验证
npm run build   # 生产构建
npm run package # 生成安装文件夹和 ZIP
npm run deploy  # 构建并更新到本机 Obsidian-Company 仓库，保留用户设置
```

本机部署路径为 `G:\Workspace\Obsidian-Company\.obsidian\plugins\technical-evidence`。`deploy` 仅更新 `main.js`、`manifest.json`、`styles.css`，不会覆盖 `data.json` 等其他文件。部署后在 Obsidian 中重新加载插件即可试用。

模块分工：`reference.ts` 处理引用与仓库路径，`schema.ts` 校验 JSON，`repository.ts` 按需读取文件，`graph.ts` 布局调用关系，`floating-panel.ts` 管理浮动窗口与拖动，`modal.ts` 展示证据，`editor.ts` 提供实时预览文字链接。

自动化验证覆盖引用、数据校验、调用图布局和代码内容的隔离。阅读视图、实时预览及不同主题下的实际表现仍需在 Obsidian 中试用。
