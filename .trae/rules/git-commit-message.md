---
alwaysApply: true
scene: git_message
---

生成符合 Conventional Commits 规范的提交信息，使用中文描述：

## 格式

```
<type>(<scope>): <subject>
```

## Type 类型

| 类型 | 说明 |
|------|------|
| feat | 新功能 |
| fix | 修复问题 |
| docs | 文档更新 |
| style | 代码格式调整（不影响功能） |
| refactor | 代码重构 |
| perf | 性能优化 |
| test | 测试相关 |
| chore | 构建/工具/配置变更 |
| revert | 回滚提交 |

## Scope 范围（可选）

根据修改内容选择合适的作用域：
- 业务模块：`user`、`order`、`product` 等
- 技术层面：`api`、`ui`、`store`、`router`、`utils` 等
- 配置文件：`config`、`build`、`deps` 等

## Subject 规范

- 使用中文，简洁明了
- 不超过 50 个字符
- 描述做了什么，而非怎么做
- 句末不加句号

## 示例

```
feat(auth): 添加用户登录功能
fix(api): 修复订单列表分页错误
docs: 更新环境变量配置说明
style: 统一代码缩进格式
refactor(user): 重构用户状态管理逻辑
perf(table): 优化大数据表格渲染性能
chore(deps): 升级 Vue 到 3.4 版本
```

## 多行提交信息

当需要详细说明时，使用多行格式：

```
feat(order): 实现订单导出功能

- 添加 Excel 导出按钮
- 集成 exceljs 库处理文件生成
- 支持批量导出选中订单
```
