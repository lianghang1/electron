import { describe, expect, it } from 'vitest'
import { renderTemplate } from './template-engine'

describe('renderTemplate —— 变量输出', () => {
  it('{{v}} 输出并 HTML 转义', () => {
    expect(renderTemplate('hello {{v}}', { v: '<b>&"x' })).toBe('hello &lt;b&gt;&amp;&quot;x')
  })

  it('{{{v}}} 原样输出（html/dataURL 场景）', () => {
    expect(renderTemplate('{{{v}}}', { v: '<b>raw</b>' })).toBe('<b>raw</b>')
  })

  it('点路径逐级取值', () => {
    expect(renderTemplate('{{a.b.c}}', { a: { b: { c: 'deep' } } })).toBe('deep')
  })

  it('取不到的路径输出空串', () => {
    expect(renderTemplate('[{{missing}}][{{a.x.y}}]', { a: {} })).toBe('[][]')
  })

  it('null/undefined 输出空串，数字/布尔按字符串化', () => {
    expect(renderTemplate('{{n}}', { n: 0 })).toBe('0')
    expect(renderTemplate('{{n}}', { n: null })).toBe('')
    expect(renderTemplate('{{n}}', {})).toBe('')
  })

  it('未闭合的 {{ 原样保留', () => {
    expect(renderTemplate('a {{b', { b: 1 })).toBe('a {{b')
  })
})

describe('renderTemplate —— {{#each}}', () => {
  it('对象元素：块内上下文为元素本身', () => {
    const out = renderTemplate('{{#each items}}[{{name}}:{{@index}}]{{/each}}', {
      items: [{ name: 'a' }, { name: 'b' }],
    })
    expect(out).toBe('[a:0][b:1]')
  })

  it('标量元素：{{value}} / {{@value}}', () => {
    const out = renderTemplate('{{#each list}}<{{value}}>{{/each}}', { list: [1, 2] })
    expect(out).toBe('<1><2>')
  })

  it('非数组/缺失 → 块输出空', () => {
    expect(renderTemplate('{{#each items}}x{{/each}}', {})).toBe('')
    expect(renderTemplate('{{#each items}}x{{/each}}', { items: 'nope' })).toBe('')
  })
})

describe('renderTemplate —— {{#if}}', () => {
  const tpl = '{{#if flag}}YES{{/if}}'

  it('真值渲染，0/空串/false/null/缺失 不渲染', () => {
    expect(renderTemplate(tpl, { flag: 1 })).toBe('YES')
    expect(renderTemplate(tpl, { flag: 'x' })).toBe('YES')
    expect(renderTemplate(tpl, { flag: 0 })).toBe('')
    expect(renderTemplate(tpl, { flag: '' })).toBe('')
    expect(renderTemplate(tpl, { flag: false })).toBe('')
    expect(renderTemplate(tpl, {})).toBe('')
  })

  it('each 内的每元素可各自走 if（同层非嵌套）', () => {
    const out = renderTemplate('{{#each rows}}{{#if hot}}!{{/if}}{{name}}{{/each}}', {
      rows: [{ name: 'a', hot: true }, { name: 'b' }],
    })
    expect(out).toBe('!ab')
  })
})
