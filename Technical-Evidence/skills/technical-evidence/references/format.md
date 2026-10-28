# Technical Evidence 支持的格式

以下描述对应当前插件实现。新增字段和行为应先以实际插件实现为准，不在文档中假定未实现的能力。

按文档结论建立条目与入口，不按函数建立索引。`evidence:` 适合结论的完整证据链；`callchain:` 仅在调用关系对结论必要时补充。证据链包含关键观察与推导，不要求调用图或完整函数代码。

## 证据链接

| 目标 | 写法 |
| --- | --- |
| JSON 条目 | `[查看证据](evidence:Evidence/通信.json#listener)` |
| 同一条目的函数图 | `[查看调用链](callchain:Evidence/通信.json#listener)` |
| 默认 JSON 数据库 | `[查看证据](evidence:#listener)` |
| Markdown 全文 | `[监听实现](evidence:Evidence/监听依据.md)` |
| Markdown 标题 | `[监听实现](evidence:Evidence/监听依据.md#监听地址)` |
| Markdown 块 | `[地址赋值](evidence:Evidence/监听依据.md#^bind-address)` |
| 仓库根目录定位 | `[监听实现](evidence:/专题/监听依据.md#监听地址)` |
| 明确相对当前笔记 | `[监听实现](evidence:../Evidence/监听依据.md#监听地址)` |

没有路径的 `evidence:#listener` 指向默认 JSON 数据库，不是当前笔记的标题。默认数据库通常为仓库根目录下的 `Evidence/evidence.json`，用户可以在设置中修改。

普通路径先相对引用笔记所在目录查找，再从仓库根目录查找；`/` 开头只按根目录查找，`./` 或 `../` 开头只按当前笔记目录查找。使用 `/` 分隔符，不使用 Windows 绝对路径。只支持仓库内的 `.md` 与 `.json`，不能直接引用 `.java`、`.c`、`.asm` 或外部数据库服务。

需要摘录决定结论的局部代码时，将其存入 Markdown 代码块或 JSON `content`，并保留原文件定位。也可用 `markdown` 段记录函数/地址、关键观察和推导，无需为每个函数另贴代码。`source` 字段是来源说明，不会自动读取指向的文件或地址。

路径或片段中有空格时可使用尖括号；保留在 URL 中有特殊含义的字符时使用百分号编码：

```markdown
[查看依据](<evidence:Evidence/Network Listener.md#Default port>)
[查看依据](evidence:Evidence/Network%20Listener.md#Default%20port)
```

路径或 ID 自身含有 `#`、`%`、括号时也应编码。JSON ID 区分大小写。Markdown 标题引用包含其下级标题；同级标题不会被包含。避免用会频繁改动的章节编号作为长期唯一定位，可使用稳定块 ID。

普通 Obsidian 笔记引用继续使用 `[[笔记#标题]]`。自定义协议只是浮动面板入口，不替代笔记之间的所有关联。

### 保留行内代码外观的入口

仅在用户明确指定符号作为入口时，将行内代码作为 Markdown 链接的显示文字；这是可选语法，不是给正文每个函数添加证据的规则：

```markdown
设备助手的升级流程以 [`G12_RCService`](callchain:Evidence/upgrade.json#upgrade-entry-selection) 为条目名。
```

以上路径和 ID 仅作格式示例。入口指向“升级条目如何选定”这一结论的依据，不是完整函数代码；生成文档时使用实际已保存的依据。`callchain:` 的 JSON 目标应包含 `callChain.nodes` 与 `edges`，符号名称本身不会自动提取或创建调用链。显示文字不需要与条目 ID 相同。通常仍将入口放在结论句或解释段落附近，`evidence:` 同样支持行内代码标签。

- 正确：反引号只包住方括号内的名称。阅读视图和实时预览显示可点击的行内代码，保留原名称，不加按钮外框。
- 不要用反引号包住完整的 `[名称](callchain:...)`；完整链接变成代码后不会提供点击入口。
- 普通文字标签仍采用插件的按钮样式；需要保留代码外观时使用上述行内代码标签。不要为此注入 HTML、添加额外 CSS 或修改符号名称。

## JSON 条目

顶层必须包含 `"version": 1` 和对象 `records`。每条记录必须有 `title`，并至少有 `evidence` 或 `callChain`。标题和 ID 优先描述结论，同一结论的多处函数来源放在同一记录中。通常使用 `evidence` 保存关键观察与推导，不必附调用图。以下是人为构造的格式示例，不代表真实样本：

```json
{
  "version": 1,
  "records": {
    "default-bind-endpoint": {
      "title": "默认监听地址的代码依据（演示）",
      "parameters": { "port": 50002, "address": "0.0.0.0" },
      "evidence": [
        {
          "title": "默认值与地址构造",
          "kind": "code",
          "language": "c",
          "source": "人为构造的 demo.c · start_listener；非真实样本",
          "content": "unsigned port = 50002;\nstruct sockaddr_in addr = {0};\naddr.sin_family = AF_INET;\naddr.sin_port = htons(port);\naddr.sin_addr.s_addr = INADDR_ANY;\nbind(fd, (struct sockaddr *)&addr, sizeof(addr));"
        },
        {
          "title": "为什么得到这个地址",
          "kind": "markdown",
          "content": "`port` 为 50002，经 `htons` 写入端口字段；`INADDR_ANY` 对应 IPv4 通配地址 0.0.0.0。上述片段构造传给 `bind` 的默认端点。"
        }
      ]
    }
  }
}
```

示例只展示相关调用语句，没有返回值处理，因此只能支撑“代码构造并传入该默认地址”，不能据此宣称运行时监听成功。

| 字段 | 约束 |
| --- | --- |
| `summary` | 可选纯文本，不要求重复正文结论 |
| `parameters` | 可选对象，值为字符串、有限数值或布尔值 |
| `evidence[]` | 每段必须有字符串 `title`、`content` 和合法的 `kind` |
| `kind` | `markdown`、`code` 或 `data` |
| `language` | 可选，代码语言；`data` 默认 `json`，其他代码默认纯文本 |
| `source` | 可选纯文本，写实际材料出处 |
| `callChain.nodes[]` | 必须有唯一非空 `id` 和 `label`；可选 `description`、`code`、`language`、`source` |
| `callChain.edges[]` | 必须有存在的 `from`、`to`，可选 `label` |

同一证据中需要 Mermaid、协议插件代码块或长表格时，优先使用独立 Markdown；JSON 的 `markdown` 段也支持 Markdown。原生函数图不自动表达证据强弱或运行时序。

添加 `callChain` 时仅保留支持当前结论的节点和边；节点用 `source` 定位、用 `description` 说明相关操作即可，`code` 可省略。不要将已有证据片段再复制到每个节点。

## 可选分级，不作为默认模板

`assessment` 仅用于确实需要结构化分级的条目。存在时 `status` 必填，可取 `confirmed`、`inferred`、`partial`、`unknown`；`basis` 可取 `static`、`runtime`、`mixed`、`unverified`。可选 `scope`、`review` 为字符串，`limitations` 为字符串数组。

不为填满这些字段生成“本轮复核、审计范围、闭合情况”等叙述。通常可省略整个 `assessment`，直接在对应代码旁说明会改变结论的真实条件。

## 渲染边界

- Markdown 使用 Obsidian 原生渲染器，相关笔记可在当前面板查看并返回。
- `protocol` 等扩展代码块需要仓库启用相应处理插件，Technical Evidence 不内置这些渲染器。
- JSON 每次打开按文件读取与解析，不是 SQL 数据库。资料量大时可按主题拆分。
- 插件不自动提取调用链、不执行代码、不读取 `source` 指向的原始材料，也不自动迁移或重写文档。
