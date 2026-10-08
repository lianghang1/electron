/**
 * 微型模板引擎：够用即可，零依赖。
 * 语法：
 *   {{ path.to.value }}     输出并 HTML 转义
 *   {{{ path.to.value }}}   原样输出（html / dataURL）
 *   {{#each items}} ... {{/each}}   数组循环；块内上下文为元素本身，{{@index}} 为下标
 *   {{#if cond}} ... {{/if}}        真值分支
 * 说明：不支持块嵌套（each 内再放 each/if）；点路径按 `.` 逐级取值，取不到输出空串。
 */

interface Scope {
  vars: Record<string, unknown>
  index?: number
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function lookup(scope: Scope, path: string): unknown {
  const trimmed = path.trim()
  if (trimmed === '@index')
    return scope.index
  if (trimmed === '@value')
    return scope.vars.value
  let cur: unknown = scope.vars
  for (const part of trimmed.split('.')) {
    if (!isObj(cur))
      return undefined
    cur = cur[part]
  }
  return cur
}

function toStr(v: unknown): string {
  return v == null ? '' : String(v)
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderTemplate(template: string, data: Record<string, unknown>): string {
  return renderScope(template, { vars: data })
}

function renderScope(text: string, scope: Scope): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('{{', i)
    if (open === -1) {
      out += text.slice(i)
      break
    }
    out += text.slice(i, open)

    const isTriple = text.startsWith('{{{', open)
    const openLen = isTriple ? 3 : 2
    const closeStr = isTriple ? '}}}' : '}}'
    const close = text.indexOf(closeStr, open + openLen)
    if (close === -1) {
      out += text.slice(open)
      break
    }
    const token = text.slice(open + openLen, close).trim()
    const bodyStart = close + closeStr.length

    if (token.startsWith('#each ')) {
      const closeTag = '{{/each}}'
      const end = text.indexOf(closeTag, bodyStart)
      const inner = text.slice(bodyStart, end === -1 ? text.length : end)
      const items = lookup(scope, token.slice('#each '.length))
      if (Array.isArray(items)) {
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx]
          const vars = isObj(item) ? item : { value: item }
          out += renderScope(inner, { vars, index: idx })
        }
      }
      i = end === -1 ? text.length : end + closeTag.length
      continue
    }

    if (token.startsWith('#if ')) {
      const closeTag = '{{/if}}'
      const end = text.indexOf(closeTag, bodyStart)
      const inner = text.slice(bodyStart, end === -1 ? text.length : end)
      const cond = lookup(scope, token.slice('#if '.length))
      if (cond !== undefined && cond !== null && cond !== false && cond !== '' && cond !== 0) {
        out += renderScope(inner, scope)
      }
      i = end === -1 ? text.length : end + closeTag.length
      continue
    }

    if (token.startsWith('/')) {
      // 游离的关闭标签（块已消费时不会走到这里）：跳过
      i = bodyStart
      continue
    }

    const value = lookup(scope, token)
    out += isTriple ? toStr(value) : escapeHtml(toStr(value))
    i = bodyStart
  }
  return out
}
