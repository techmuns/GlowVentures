import ts from 'typescript';
import type { Plugin } from 'vite';
import { CANONICAL_BOOK_KEYS } from '../../shared/canonicalBookKeys.mjs';

/** Keep generated source byte-identical. Only the browser build gains the
 * complete-version resolver; Node regeneration and audit builds stay canonical. */
export function runtimeBookPlugin(): Plugin {
  return { name: 'verified-runtime-book', enforce: 'pre', transform(code, id) {
    if (!/\/src\/data\/glowData\.ts$/.test(id)) return null;
    const file = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const edits: { start: number; end: number; key: string }[] = [];
    for (const statement of file.statements) {
      if (!ts.isVariableStatement(statement) || !statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text.startsWith('BOOK_') && declaration.initializer) {
          edits.push({ key: declaration.name.text, start: declaration.initializer.getStart(file), end: declaration.initializer.getEnd() });
        }
      }
    }
    if (edits.map(e => e.key).sort().join() !== [...CANONICAL_BOOK_KEYS].sort().join()) throw Error('Incomplete runtime book export contract');
    let output = code;
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      output = output.slice(0, edit.start) + `runtimeBookValue(${JSON.stringify(edit.key)}, ${output.slice(edit.start, edit.end)})` + output.slice(edit.end);
    }
    return { code: 'import { runtimeBookValue } from "../lib/runtimeBook";\n' + output, map: null };
  } };
}
