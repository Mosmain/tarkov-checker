/**
 * gen-rust-regex.mjs
 *
 * Generates Rust source files containing regex constants that mirror the
 * TypeScript regex literals in parse-log.ts and parse-screenshot.ts.
 *
 * WHAT IS GENERATED
 *   apps/desktop/src-tauri/src/server/parse_log_regexes.rs
 *     — SCENE_PRESET_RE, TRANSIT_LOCATION_RE, TRACE_LOCATION_RE
 *   apps/desktop/src-tauri/src/server/parse_screenshot_regexes.rs
 *     — POSITION_RE_STR, ORIENTATION_RE_STR
 *       (NUM fragment expanded inline — no format!() needed in Rust)
 *
 * WHERE TO RUN
 *   pnpm shared:gen-rust-regex
 *   (from repo root — resolves to: node packages/shared/scripts/gen-rust-regex.mjs)
 *
 * HOW TO ADD A NEW REGEX
 *   1. Add a `const NAME_RE = /pattern/flags;` export (or non-export) in the
 *      TS source file listed in SOURCE_FILES below.
 *   2. Run `pnpm shared:gen-rust-regex`.
 *   3. Commit both the TS source and the generated .rs file.
 *
 * FLAGS TRANSLATION
 *   TS /pattern/i  →  Rust r"(?i)pattern"  (inline flag prefix)
 *   TS /pattern/m  →  Rust r"(?m)pattern"
 *   TS /pattern/s  →  Rust r"(?s)pattern"
 *   Multiple flags are combined: /pattern/im → r"(?im)pattern"
 *   No flags needed → pattern left as-is.
 *
 * SCREENSHOT REGEXES
 *   parse-screenshot.ts builds its regexes with new RegExp(template) using a
 *   shared NUM fragment constant rather than a literal /…/. The codegen handles
 *   this specially: it reads the NUM string, substitutes it into the templates,
 *   and emits the fully-expanded patterns as Rust string constants.
 *
 * REQUIREMENTS
 *   Node.js >= 20 (ships with the repo's engine constraint).
 *   No additional npm packages needed — plain ESM, uses only Node built-ins.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

// ---------------------------------------------------------------------------
// Source-file text parsing (regex-over-source — deterministic for our usage)
// ---------------------------------------------------------------------------

/**
 * Extract `const NAME = /pattern/flags;` regex literals from a TS source text.
 * Returns an array of { name, pattern, flags }.
 *
 * This is intentionally regex-over-source rather than full AST parsing so the
 * script stays zero-dep (no tsx/ts-node needed). The pattern is unambiguous for
 * our specific `const FOO = /…/flags;` declarations — it is NOT a general TS
 * parser and does not handle all edge cases.
 */
function extractRegexLiterals(src) {
  // Matches: const NAME_RE = /pattern/flags; or
  //          const NAME_RE = /pattern/;
  // The pattern portion is captured lazily; flags are optional word chars.
  // The terminator is ; or whitespace+newline (handles minified and normal code).
  //
  // Technique: since regex patterns can themselves contain `/`, we match the
  // last `/` before the statement end (`;` or end-of-line). This handles our
  // actual patterns which never contain unescaped `/`.
  const lineRe = /^(?:export\s+)?const\s+(\w+)\s*=\s*\/(.+?)\/([gimsuy]*)\s*;/gm;
  const results = [];
  let m;
  while ((m = lineRe.exec(src)) !== null) {
    results.push({ name: m[1], pattern: m[2], flags: m[3] ?? '' });
  }
  return results;
}

/**
 * Extract `const NAME = 'string';` declarations from source text.
 * Returns a Map<name, value>.
 */
function extractStringConsts(src) {
  const map = new Map();
  // Single-quoted string
  const singleRe = /^(?:export\s+)?const\s+(\w+)\s*=\s*'((?:[^'\\]|\\.)*)'\s*;/gm;
  // Double-quoted string
  const doubleRe = /^(?:export\s+)?const\s+(\w+)\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/gm;
  let m;
  while ((m = singleRe.exec(src)) !== null) {
    // Unescape common JS escape sequences in single-quoted strings
    map.set(m[1], unescapeJsString(m[2]));
  }
  while ((m = doubleRe.exec(src)) !== null) {
    map.set(m[1], unescapeJsString(m[2]));
  }
  return map;
}

/**
 * Unescape common JS string escape sequences.
 * Only the sequences we actually see in parse-screenshot.ts are handled.
 */
function unescapeJsString(s) {
  return s
    .replace(/\\\\/g, '\\') // \\ → \
    .replace(/\\n/g, '\n') // \n → newline
    .replace(/\\t/g, '\t') // \t → tab
    .replace(/\\r/g, '\r') // \r → CR
    .replace(/\\'/g, "'") // \' → '
    .replace(/\\"/g, '"'); // \" → "
}

/**
 * Extract `new RegExp(templateLiteral)` declarations from source text,
 * substituting known string constants for `${IDENTIFIER}` spans.
 * Returns an array of { name, pattern, flags }.
 */
function extractRegExpNewCalls(src, stringConsts) {
  const results = [];
  // Matches: const NAME = new RegExp(`...template...`);
  //          const NAME = new RegExp(`...template...`, 'flags');
  // We capture the backtick-delimited template as a raw string.
  // The trailing `\s*,?\s*` before `\)` handles trailing commas after the
  // template literal — e.g. `new RegExp(`pat`,\n);` — which Prettier emits
  // on multi-line calls. The optional comma also covers the no-comma case.
  const newRegExpRe =
    /^(?:export\s+)?const\s+(\w+)\s*=\s*new\s+RegExp\(\s*`((?:[^`\\]|\\.)*)`(?:\s*,\s*['"]([gimsuy]*)['"])?\s*,?\s*\)\s*;/gm;

  let m;
  while ((m = newRegExpRe.exec(src)) !== null) {
    const name = m[1];
    const rawTemplate = m[2];
    const flags = m[3] ?? '';

    // Substitute ${IDENTIFIER} spans using the known string const map
    const expanded = rawTemplate.replace(/\$\{(\w+)\}/g, (_, id) => {
      const val = stringConsts.get(id);
      if (val === undefined) {
        throw new Error(`Unknown identifier \${${id}} in template for ${name}`);
      }
      return val;
    });

    // The template literal uses \\ to represent a literal backslash in the
    // resulting string. Since we read the raw source text, we need to convert
    // the JS escape sequences in the template literal.
    // In a template literal: \\ → \ (single backslash in runtime string)
    const pattern = expanded.replace(/\\\\/g, '\\');

    results.push({ name, pattern, flags });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Rust emission helpers
// ---------------------------------------------------------------------------

const TS_FLAGS_TO_INLINE = {
  i: 'i',
  m: 'm',
  s: 's',
  u: '', // unicode is default in Rust regex crate
  g: '', // no global flag in Rust single-match API
};

function convertFlags(tsFlags) {
  return tsFlags
    .split('')
    .map((f) => TS_FLAGS_TO_INLINE[f] ?? '')
    .join('');
}

function toRustPattern(pattern, flags) {
  const inlineFlags = convertFlags(flags);
  return inlineFlags ? `(?${inlineFlags})${pattern}` : pattern;
}

/**
 * Emit a Rust source file containing `pub const` string constants.
 * Uses raw string literals (r#"..."#) to avoid backslash escaping issues.
 */
function emitRustFile(destPath, sourceTsPath, constants, headerComment) {
  const relSource = path.relative(REPO_ROOT, sourceTsPath).replace(/\\/g, '/');
  const lines = [
    '// AUTO-GENERATED FILE — DO NOT EDIT',
    `// Source: ${relSource}`,
    '// Regenerate: pnpm shared:gen-rust-regex',
    '//',
    headerComment,
    '',
  ];
  for (const { name, rustPattern } of constants) {
    lines.push(`pub const ${name}: &str = r#"${rustPattern}"#;`);
  }
  lines.push('');
  fs.writeFileSync(destPath, lines.join('\n'), 'utf8');
  console.log(`  wrote ${path.relative(REPO_ROOT, destPath).replace(/\\/g, '/')}`);
}

// ---------------------------------------------------------------------------
// Process parse-log.ts
// ---------------------------------------------------------------------------

function processParseLog() {
  const srcPath = path.join(REPO_ROOT, 'packages/shared/src/parse-log.ts');
  const destPath = path.join(REPO_ROOT, 'apps/desktop/src-tauri/src/server/parse_log_regexes.rs');

  const src = fs.readFileSync(srcPath, 'utf8');
  const regexes = extractRegexLiterals(src);

  const targetNames = ['SCENE_PRESET_RE', 'TRANSIT_LOCATION_RE', 'TRACE_LOCATION_RE'];
  const found = targetNames.map((name) => {
    const r = regexes.find((x) => x.name === name);
    if (!r) {
      throw new Error(
        `Expected regex constant ${name} in parse-log.ts — not found.\n` +
          `Found: ${regexes.map((x) => x.name).join(', ') || 'none'}`,
      );
    }
    return { name, rustPattern: toRustPattern(r.pattern, r.flags) };
  });

  emitRustFile(
    destPath,
    srcPath,
    found,
    '// Regex patterns for Tarkov log line parsing.\n' +
      '// The (?i) prefix is the inline Rust equivalent of the /i flag in the TS source.\n' +
      '// Consumed by logs.rs via `Regex::new(parse_log_regexes::NAME)`.',
  );
}

// ---------------------------------------------------------------------------
// Process parse-screenshot.ts
// ---------------------------------------------------------------------------

function processParseScreenshot() {
  const srcPath = path.join(REPO_ROOT, 'packages/shared/src/parse-screenshot.ts');
  const destPath = path.join(
    REPO_ROOT,
    'apps/desktop/src-tauri/src/server/parse_screenshot_regexes.rs',
  );

  const src = fs.readFileSync(srcPath, 'utf8');

  // Collect the NUM string constant first
  const stringConsts = extractStringConsts(src);
  const numValue = stringConsts.get('NUM');
  if (!numValue) {
    throw new Error('NUM constant not found in parse-screenshot.ts');
  }

  // Extract new RegExp(...) calls with NUM substituted in
  const regexes = extractRegExpNewCalls(src, stringConsts);

  const targetNames = ['POSITION_RE', 'ORIENTATION_RE'];
  const found = targetNames.map((name) => {
    const r = regexes.find((x) => x.name === name);
    if (!r) {
      throw new Error(
        `Expected regex constant ${name} in parse-screenshot.ts — not found.\n` +
          `Found: ${regexes.map((x) => x.name).join(', ') || 'none'}`,
      );
    }
    return { name: `${name}_STR`, rustPattern: toRustPattern(r.pattern, r.flags) };
  });

  emitRustFile(
    destPath,
    srcPath,
    found,
    '// Regex pattern strings for Tarkov screenshot filename parsing.\n' +
      '// NUM is expanded inline — no runtime format!() call needed.\n' +
      '// Consumed by screenshots.rs via `Regex::new(parse_screenshot_regexes::NAME_STR)`.',
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

console.log('gen-rust-regex: generating Rust regex constants from TS sources');
processParseLog();
processParseScreenshot();
console.log('gen-rust-regex: done');
