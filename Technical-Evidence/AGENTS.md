# 本地测试部署

用户要求：每次完成此插件的修改并通过验证后，自动将构建产物部署到：

`G:\Workspace\Obsidian-Company\.obsidian\plugins\technical-evidence`

运行 `npm test` 和 `npm run deploy`。部署脚本会构建、打包，并仅替换目标目录的 `main.js`、`manifest.json`、`styles.css`，逐一校验复制结果。保留 `data.json` 和其他用户文件。不要通过 UI 自动化操作 Obsidian，由用户自行试用和反馈问题。
