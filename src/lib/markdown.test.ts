import { describe, expect, it } from 'vitest'
import { renderMarkdownToSafeHtml } from './markdown'

describe('renderMarkdownToSafeHtml', () => {
  it('renders a heading as an <h1> element', () => {
    const html = renderMarkdownToSafeHtml('# Hello world')
    expect(html).toContain('<h1>Hello world</h1>')
  })

  it('renders a link as an <a> element with its href preserved', () => {
    const html = renderMarkdownToSafeHtml('[c4hero](https://c4hero.com)')
    expect(html).toContain('<a href="https://c4hero.com">c4hero</a>')
  })

  it('renders a fenced code block as <pre><code>', () => {
    const html = renderMarkdownToSafeHtml('```\nconst x = 1\n```')
    expect(html).toContain('<pre>')
    expect(html).toContain('<code>')
    expect(html).toContain('const x = 1')
  })

  it('strips a raw <script> tag embedded in the source markdown', () => {
    const html = renderMarkdownToSafeHtml(
      '# Title\n\n<script>alert("xss")</script>\n\nSome text',
    )
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('Some text')
  })
})
