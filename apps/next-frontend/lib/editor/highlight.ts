// A deliberately tiny generic tokenizer for the code block's read mode.
// Per-language grammars are out of scope — this highlights the common
// shapes (comments, strings, numbers, keywords) of most languages.

export type TokenKind = "plain" | "keyword" | "string" | "comment" | "number" | "fn";

export interface CodeToken {
  text: string;
  kind: TokenKind;
}

const KEYWORDS = new Set([
  // Pragmatic union of common imperative/scripting languages.
  "const", "let", "var", "function", "return", "if", "else", "elif", "for",
  "while", "class", "extends", "new", "import", "from", "export", "default",
  "async", "await", "try", "catch", "finally", "throw", "typeof",
  "instanceof", "def", "lambda", "None", "True", "False", "self", "print",
  "pass", "with", "as", "in", "is", "not", "and", "or", "yield", "struct",
  "impl", "fn", "pub", "match", "use", "mut", "select", "insert", "update",
  "delete", "where", "case", "switch", "break", "continue", "do", "int",
  "float", "str", "bool", "void", "public", "private", "static", "package",
  "interface", "enum", "type", "defer", "range", "nil", "null", "true",
  "false", "undefined", "this", "super", "end",
]);

// `#` line comments are only honored for languages that use them —
// otherwise CSS hex colors and URLs would render as comments.
const HASH_COMMENT_LANGUAGES = new Set([
  "python", "py", "sh", "bash", "shell", "zsh", "yaml", "yml", "ruby",
  "rb", "perl", "r", "makefile", "dockerfile", "toml", "ini", "conf",
]);

const PATTERN_DEFAULT =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([\s\S])/g;

const PATTERN_HASH =
  /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([\s\S])/g;

export function tokenize(code: string, language: string | null = null): CodeToken[] {
  const lang = (language ?? "").trim().toLowerCase();
  const pattern = HASH_COMMENT_LANGUAGES.has(lang) ? PATTERN_HASH : PATTERN_DEFAULT;
  pattern.lastIndex = 0;

  const tokens: CodeToken[] = [];
  const push = (text: string, kind: TokenKind) => {
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind) {
      last.text += text;
    } else {
      tokens.push({ text, kind });
    }
  };

  for (let m = pattern.exec(code); m !== null; m = pattern.exec(code)) {
    const [text, comment, str, num, identifier] = m;
    if (comment !== undefined) {
      push(text, "comment");
    } else if (str !== undefined) {
      push(text, "string");
    } else if (num !== undefined) {
      push(text, "number");
    } else if (identifier !== undefined) {
      // Peek for a call-site `(` to tag function names.
      const isCall = code[pattern.lastIndex] === "(";
      push(text, KEYWORDS.has(identifier) ? "keyword" : isCall ? "fn" : "plain");
    } else {
      push(text, "plain");
    }
  }
  return tokens;
}

export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: "text-text-primary",
  keyword: "text-accent-neon",
  string: "text-accent-amber",
  comment: "text-text-muted",
  number: "text-accent-amber/80",
  fn: "text-text-primary underline decoration-accent-neon/30",
};
