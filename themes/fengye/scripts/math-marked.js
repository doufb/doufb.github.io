'use strict';

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

hexo.extend.filter.register('marked:extensions', function (extensions) {
  extensions.push({
    name: 'displayMath',
    level: 'block',
    start(src) {
      return src.match(/\$\$/)?.index;
    },
    tokenizer(src) {
      const match = /^\s{0,3}\$\$\s*\n([\s\S]+?)\n\s*\$\$(?:\n|$)/.exec(src);
      if (!match) return undefined;

      return {
        type: 'displayMath',
        raw: match[0],
        text: match[1].trim().replace(/\n{2,}/g, '\n')
      };
    },
    renderer(token) {
      return `<div class="math-display">\\[${escapeHtml(token.text)}\\]</div>\n`;
    }
  });

  extensions.push({
    name: 'inlineMath',
    level: 'inline',
    start(src) {
      return src.match(/\$/)?.index;
    },
    tokenizer(src) {
      if (src.startsWith('$$')) return undefined;
      const match = /^\$((?:\\.|[^$\n\\])+?)\$(?!\$)/.exec(src);
      if (!match) return undefined;

      return {
        type: 'inlineMath',
        raw: match[0],
        text: match[1].trim()
      };
    },
    renderer(token) {
      return `<span class="math-inline">\\(${escapeHtml(token.text)}\\)</span>`;
    }
  });
});
