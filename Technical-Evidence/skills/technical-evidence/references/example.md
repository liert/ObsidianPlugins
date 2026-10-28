# 从结果到可查看依据的写法

以下均为人为构造的演示，与任何真实样本无关。实际文档应替换为真实材料，不能复制示例作为取证结果。

## 正文可以完整解释机制

假设用户在写一篇完整的服务初始化说明，无需把它压缩成“监听 50002”一句话。可以写：

```markdown
## 服务如何确定监听端点

初始化先取得端口值，再把它转成网络字节序，写入 IPv4 地址结构。地址字段取 `INADDR_ANY`，所以默认绑定范围是 `0.0.0.0`，不是客户端所用的 `127.0.0.1`。

端口默认值为 50002，命令行 `-p` 可以覆盖。也就是说，50002 是未覆盖参数时的默认端点；客户端连接 loopback 本身不能证明服务只绑定 loopback。

[查看默认端点与参数覆盖的依据](evidence:Evidence/服务初始化.md#监听端点)
```

这里的入口支撑“默认端点怎样确定、端口可被参数覆盖”这组共享推导的结论。`INADDR_ANY`、`bind` 等名称保持普通行内代码，不为每个符号另挂入口。面板关联相关来源、关键取值与覆盖分支，不复制完整函数。

## 对应证据文件

以下展示 `Evidence/服务初始化.md` 的内容形态。来源定位也属于演示；真实使用时填写实际来源。

````markdown
---
title: 服务初始化的技术依据
tags:
  - 技术依据
---

## 监听端点

来源：人为构造的 `demo/listener.c`，`parse_options()` 与 `start_listener()`。以下为解释相关分支的等价代码，非真实样本摘录；省略了与端点选择无关的日志。

```c
unsigned port = 50002;

// 参数选择阶段
if (option == 'p') {
    port = strtoul(optarg, NULL, 10);
    if (port < 1) port = 50002;
}

// 监听地址构造阶段
struct sockaddr_in addr = {0};
addr.sin_family = AF_INET;
addr.sin_port = htons((uint16_t)port);
addr.sin_addr.s_addr = INADDR_ANY;
bind(fd, (struct sockaddr *)&addr, sizeof(addr));
```

`port` 的初始化给出默认值；`-p` 分支会替换它。`htons` 只转换字节序，端口选择发生在此前。IPv4 地址字段赋值为 `INADDR_ANY`，因此传入 `bind` 的地址为通配地址。

这段整理代码没有展示 `bind` 的返回值和运行参数，支撑的是默认端点构造，不是某次启动成功的运行结果。
````

不要把参数覆盖分支删掉后声称端口永远固定；也不要为了附带这一个条件，在每段重复“未经实机复核”。

完整的 `parse_options()`、`start_listener()` 可由读者在 IDA 或其他工具中查看，以上只摘出形成结论的相关操作。真实片段已在正文给出时，证据可引用其位置并补充缺失的关联；如果提供可点击调用图，关键节点仍保留本节点的决定性短摘录，不能让点击结果只剩函数名和说明。

## 避免按函数批量挂证据

以下是用户指出的错误写法（只用于识别写作问题，不代表此处已核对过该样本或证据文件）：

```markdown
[`crc16_xmodem@0x08002DD0`](evidence:Evidence/G20-MCU.json#crc) 的反编译核心为：
```

它只是在引出函数代码，没有表达需要证据支持的分析结论。不能因为函数名带有地址，或目标 ID 恰好叫 `crc`，就把链接挂在这里。若仍需引出决定结论的局部片段，函数名保留为普通行内代码；若仅是完整函数实现介绍，则无需在文档中再复制一遍实现。

真正应建立证据链的是实际得出的 CRC 结论：例如算法为何被识别为某一变体、校验覆盖哪些字节。入口放在相应结论处，依据关联已观察到的初值、多项式、移位操作或调用者给出的区间，并解释它们如何支持该结论；只选择与具体结论有关的项目，不凭函数名称认定算法。这里不提供该样本的 CRC 参数，避免将格式示例误当作样本结论。

不合适：为正文中的 `parse_options`、`start_listener`、`htons`、`bind` 分别创建独立条目、附完整函数，并给每个函数名加链接。这样得到函数索引，却没有解释“为什么默认端点是这个值”。

更合适：只在端点结论附近提供上面的一个入口，把默认值来源、覆盖分支、字段写入与结论串起来。涉及多个函数不等于需要多个证据条目；重复提及这些函数也不重复添加入口。

## 何时用调用图

只有函数间的实际关系有助于解释当前结论时才使用 `callchain:`，端点数值的推导不必附调用图。证据链本身是观察到结论的支撑关系，不等于调用链。数据从 APP、代理到设备的路径通常更适合 Mermaid。

如果已知 `start_listener` 分别调用 `bind` 与 `listen`，应画两条从 `start_listener` 出发的边；不能因为这两句代码先后出现，就画成 `start_listener → bind → listen`。

如果一个函数的返回值决定后续行为，证据应包含返回值使用的位置。只有调用名而没有条件、参数与返回处理时，通常不足以解释业务结果。

## 关键节点要能直接核对代码

以下仍是人为构造的演示，不是真实样本。假设要解释“仅 SET 分支调用配置处理，处理器拒绝大于 3 的 mode，其返回值写入 result”。只画 `process_message → apply_changes` 并写这句说明，无法检验命令条件、参数来源、范围检查或返回值流向。

对应 JSON 可以保留以下决定性代码，不收录整个服务的实现：

```json
{
  "version": 1,
  "records": {
    "set-mode-result": {
      "title": "SET分支的范围检查与结果传递（演示）",
      "evidence": [
        {
          "title": "代码如何支持判断",
          "kind": "markdown",
          "content": "调用者在cmd不是CMD_SET时直接返回-2；只有SET分支将payload交给apply_changes。被调者检查payload[0]>3并返回-1，检查通过才写cfg.mode。调用者将返回值原样赋给out->result。因此范围错误会进入SET应答的result，但不说明数据已持久化或设备已执行任何实际动作。两个节点中的代码均为人为构造的示例源码。"
        }
      ],
      "callChain": {
        "nodes": [
          {
            "id": "dispatch",
            "label": "process_message",
            "source": "人为构造的demo/dispatch.c · process_message；非真实样本",
            "description": "演示源码摘录：命令条件、调用实参与结果使用；省略无关日志",
            "language": "c",
            "code": "if (cmd != CMD_SET) return -2;\nint ret = apply_changes(payload);\nout->result = ret;\nreturn ret;"
          },
          {
            "id": "apply",
            "label": "apply_changes",
            "source": "人为构造的demo/config.c · apply_changes；非真实样本",
            "description": "演示源码摘录：范围判断在写入之前；不包含持久化逻辑",
            "language": "c",
            "code": "if (payload[0] > 3) return -1;\ncfg.mode = payload[0];\nreturn 0;"
          }
        ],
        "edges": [
          { "from": "dispatch", "to": "apply", "label": "cmd==CMD_SET，传入payload" }
        ]
      }
    }
  }
}
```

检查这组证据时，可以直接对应：调用者的命令判断支持进入条件，`apply_changes(payload)` 支持调用边和实参，被调者的比较与赋值支持范围结论，`out->result = ret` 支持结果传递。若缺少被调者代码，就只能说明“调用并传入payload”，不能补写“检查范围后应用配置”。若缺少返回值使用，就不能据此说明应答怎样反映错误。

这里不要求为 `return`、结构字段或每个函数名另建条目，也不要求为通用库函数复制实现。需要展示的是当前判断所依赖的实际操作；“不重复完整函数”不能解释成“关键节点不附代码”。
