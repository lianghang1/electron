## 代码风格规范

### 控制语句大括号

所有 `if`/`else`/`for`/`while`/`do` 等控制语句必须使用完整大括号，禁止省略大括号的简写形式。

```ts
// ❌ 禁止
if (!ent)
  return

if (x)
  return

// ✅ 正确
if (!ent) {
  return
}

if (x) {

}
```
