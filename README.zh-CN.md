# CSV Preflight Action

[English](README.md)

在 GitHub Actions 中检查一个 UTF-8 CSV 文件的结构问题。该复合 Action 完全在 GitHub
Runner 内运行，不需要 API Key；除 Node.js 20 或更高版本外，没有运行时依赖。

它可以检测：

- 无效 UTF-8 和 UTF-16 输入；
- 未闭合的引号字段；
- 空表头或重复表头；
- 列数与表头不一致的行；
- 完全重复的数据行。

解析成功时，Action 会写出规范化 CSV，并始终写出问题报告。发现结构问题时返回退出码
1，因此工作流会失败，同时不会静默修改含义不明确的数据行。

## 使用方法

```yaml
name: CSV preflight

on:
  pull_request:
    paths:
      - "data/import.csv"

permissions:
  contents: read

jobs:
  csv-preflight:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check CSV structure
        uses: softpeanut/csv-preflight-action@v1
        with:
          path: data/import.csv
          normalized_path: ${{ runner.temp }}/import.normalized.csv
          report_path: ${{ runner.temp }}/import.issues.csv
      - name: Preserve evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: csv-preflight
          if-no-files-found: warn
          path: |
            ${{ runner.temp }}/import.normalized.csv
            ${{ runner.temp }}/import.issues.csv
```

如果需要更严格的供应链固定，请将 `v1` 替换为你已审核版本的完整 commit SHA。

## 输入

| 输入 | 必填 | 说明 |
| --- | --- | --- |
| `path` | 是 | 工作区相对路径或绝对路径。最大 10 MiB。 |
| `normalized_path` | 否 | 规范化 CSV 的目标路径。默认写入 Runner 临时目录。 |
| `report_path` | 否 | 问题报告 CSV 的目标路径。默认写入 Runner 临时目录。 |

输入、规范化输出和报告必须使用不同路径。已有输出文件不会被覆盖。

## 边界

该工具检查 CSV 结构，不检查特定导入器的 Schema 或业务规则。检查通过不代表 Shopify、
ERP 或其他目标系统一定接受该文件。Action 本身不发起网络请求，但 Runner 以及后续的
artifact 步骤仍属于你的信任边界。不要因为验证器在 Runner 本地处理，就把密钥或受监管
数据提交到仓库或 artifact。

## 源码与支持

实现无第三方运行时依赖，并采用 MIT 许可证。可复现的问题请提交到
[GitHub Issues](https://github.com/softpeanut/csv-preflight-action/issues)。完整的 SHA 固定、
失败报告保留和最小权限示例请参阅
[详细指南](https://softpeanut.github.io/csv-preflight/validate-csv-github-actions.html)。

如果这个免费 Action 节省了你的时间，可以选择向
[`softpeanut@stacker.news`](lightning:softpeanut@stacker.news) 发送 Lightning 小费。小费不购买
支持、功能、服务或导入保证。

## 可选的固定范围配置服务

如果你希望由维护者为一个公开仓库或脱敏最小复现配置这条 CSV 工作流，可先阅读
[USD 99 中文完整条款](https://softpeanut.github.io/csv-preflight/ci-setup-terms-zh-CN.html)。
公开 Issue 仅用于确认是否适用，不代表预订或付款；双方书面确认范围、交付、付款、取消
和退款条件之前，不会开始工作或要求付款。
