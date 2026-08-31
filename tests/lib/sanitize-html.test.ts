import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '@/lib/sanitize-html';

describe('sanitizeHtml', () => {
  it('drops script elements so a </script> payload cannot break out', () => {
    const output = sanitizeHtml('<p>Lovely bouquet</p><script>fetch("/api/admin/promos")</script><p>Thanks</p>');
    expect(output).toBe('<p>Lovely bouquet</p><p>Thanks</p>');
    expect(output).not.toContain('script');
  });

  it('drops on* event handler attributes', () => {
    expect(sanitizeHtml('<img src="/roses.jpg" alt="Roses" onerror="alert(document.cookie)">')).toBe('<img src="/roses.jpg" alt="Roses">');
    expect(sanitizeHtml('<p onmouseover="alert(1)" onclick="alert(2)">Hover</p>')).toBe('<p>Hover</p>');
  });

  it('drops javascript: and data: URLs', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">click</a>')).toBe('<a>click</a>');
    expect(sanitizeHtml('<img src="data:text/html;base64,PHNjcmlwdD4=" alt="">')).toBe('<img alt="">');
  });

  it('drops javascript: URLs hidden behind HTML entities', () => {
    expect(sanitizeHtml('<a href="java&#115;cript:alert(1)">click</a>')).toBe('<a>click</a>');
    expect(sanitizeHtml('<a href="javascript&colon;alert(1)">click</a>')).toBe('<a>click</a>');
  });

  it('strips svg, iframe, object, embed, style and comments', () => {
    expect(sanitizeHtml('<svg><script>alert(1)</script></svg>')).toBe('');
    expect(sanitizeHtml('<iframe src="https://evil.example"></iframe>')).toBe('');
    expect(sanitizeHtml('<object data="evil.swf"></object><embed src="evil.swf">')).toBe('');
    expect(sanitizeHtml('<p>Hi<style>body{display:none}</style></p>')).toBe('<p>Hi</p>');
    expect(sanitizeHtml('<p>a<!-- leaked comment -->b</p>')).toBe('<p>ab</p>');
  });

  it('drops style attributes', () => {
    expect(sanitizeHtml('<p style="background:url(javascript:alert(1))">Hi</p>')).toBe('<p>Hi</p>');
  });

  it('escapes a bare "<" that is not a tag', () => {
    expect(sanitizeHtml('5 < 6 stems')).toBe('5 &lt; 6 stems');
  });

  it('leaves benign rich text untouched', () => {
    const rich = '<p>Keep roses <strong>fresh</strong> longer.</p>\n<ul>\n<li>Trim the stems</li>\n<li>Change the <a href="https://example.com/rose-care" title="Rose care">water</a> daily</li>\n</ul>\n<blockquote><em>Enjoy!</em></blockquote>';
    expect(sanitizeHtml(rich)).toBe(rich);
  });

  it('unwraps unknown but harmless tags and closes tags left open', () => {
    expect(sanitizeHtml('<article><p>Text</p></article>')).toBe('<p>Text</p>');
    expect(sanitizeHtml('<p>Unclosed')).toBe('<p>Unclosed</p>');
  });
});
