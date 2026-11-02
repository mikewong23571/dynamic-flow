import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import postcss from 'postcss';

const root = resolve(process.argv[2] || process.cwd());
const client = resolve(root, 'src/client');
const failures = [];
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(resolve(directory, entry.name))
          : [resolve(directory, entry.name)],
      ),
    )
  ).flat();
}
function fail(file, line, message) {
  failures.push(`${relative(root, file)}:${line}: ${message}`);
}
for (const file of await files(client)) {
  if (!/\.(?:css|tsx)$/.test(file)) continue;
  const text = await readFile(file, 'utf8');
  if (file.endsWith('.css')) {
    const ast = postcss.parse(text, { from: file });
    ast.walkAtRules('layer', (layer) => {
      for (let parent = layer.parent; parent; parent = parent.parent) {
        if (
          parent.type === 'atrule' &&
          parent.name === 'layer' &&
          parent.params === layer.params
        ) {
          fail(
            file,
            layer.source.start.line,
            `repeated nested layer ${layer.params} changes cascade priority`,
          );
          break;
        }
      }
    });
    ast.walkRules((rule) => {
      let layer;
      for (let parent = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'atrule' && parent.name === 'layer')
          layer = parent.params;
      }
      if (!layer)
        fail(
          file,
          rule.source.start.line,
          'owned rule requires an explicit cascade layer',
        );
      const targetsPrimitive =
        /\[data-slot=['"](?:button|input|textarea|native-select)['"]\]|(?:^|[\s,>])(?:input|select|textarea)(?=[\s,.[#:>]|$)/.test(
          rule.selector,
        );
      rule.walkDecls((declaration) => {
        const isTheme =
          relative(client, file) === 'styles.css' &&
          rule.selector === ':root' &&
          declaration.prop.startsWith('--');
        if (
          !isTheme &&
          /#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\(/i.test(declaration.value)
        ) {
          fail(
            file,
            declaration.source.start.line,
            'literal color belongs to the root theme tokens',
          );
        }
        if (
          targetsPrimitive &&
          /^(?:font(?:-.+)?|padding(?:-.+)?|height|min-height|border(?:-.+)?|background(?:-.+)?|color)$/.test(
            declaration.prop,
          )
        ) {
          // The base reset owns only inheritance, never component appearance.
          if (layer !== 'base')
            fail(
              file,
              declaration.source.start.line,
              'primitive appearance belongs to its public variant/size API',
            );
        }
      });
      if (/\.button\b|\.field(?![\w-])|\.modal-actions\b/.test(rule.selector)) {
        fail(file, rule.source.start.line, 'retired compatibility selector');
      }
      if (
        layer === 'components' &&
        /(^|,)\s*fieldset\s*($|,)/.test(rule.selector)
      ) {
        fail(
          file,
          rule.source.start.line,
          'field layout must use the explicit FormFields composition',
        );
      }
    });
  }
  if (file.endsWith('.tsx')) {
    if (
      /(?:bg|text|border|ring|fill|stroke)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/.test(
        text,
      )
    ) {
      fail(file, 1, 'palette utility color must use a semantic theme role');
    }
    if (/import\s+['"][^.'"][^'"]*\.css['"]/.test(text)) {
      fail(
        file,
        1,
        'third-party CSS must enter through the layered stylesheet',
      );
    }

    for (const match of text.matchAll(
      /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]*\/ui)['"]/g,
    )) {
      if (/(?:^|,)\s*Button(?:\s+as\s+\w+)?\s*(?:,|$)/.test(match[1])) {
        fail(
          file,
          text.slice(0, match.index).split('\n').length,
          'import Button from components/ui/button',
        );
      }
    }
    if (/\b(?:bg|text|border)-\[(?:#|rgba?\(|hsla?\()/.test(text)) {
      fail(file, 1, 'literal utility color belongs to a semantic token');
    }
  }
}
if (failures.length) {
  process.stderr.write(failures.join('\n') + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write(
    'Client style contracts passed: layers, tokens, public control APIs and explicit field groups.\n',
  );
}
