/**
 * Formulas without LaTeX: calculator-style input such as `(x+1)/2`, `sqrt(x)`, `lim(x->0) sin(x)/x`
 * becomes TeX for KaTeX. Input that already contains a backslash is treated as LaTeX and passed through.
 */
const GREEK = new Set("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi pi rho sigma tau phi chi psi omega Gamma Delta Theta Lambda Pi Sigma Phi Psi Omega".split(" "));
const FUNCS = new Set("sin cos tan cot arcsin arccos arctan ln log exp max min det".split(" "));
const RU: Record<string, string> = { "альфа": "alpha", "бета": "beta", "гамма": "gamma", "дельта": "delta", "пи": "pi", "лямбда": "lambda", "сигма": "sigma", "омега": "omega", "фи": "phi", "тета": "theta", "корень": "sqrt", "сумма": "sum", "интеграл": "int", "предел": "lim", "бесконечность": "inf", "модуль": "abs" };
const UNI: Record<string, string> = { "√": "sqrt", "π": "pi", "∞": "inf", "∑": "sum", "∫": "int", "≤": "<=", "≥": ">=", "≠": "!=", "→": "->", "±": "+-", "·": "*", "×": "*", "÷": "/", "≈": "~~", "α": "alpha", "β": "beta", "λ": "lambda", "Δ": "Delta", "θ": "theta" };
const OPS: Record<string, string> = { "<=": "\\le ", ">=": "\\ge ", "!=": "\\ne ", "->": "\\to ", "=>": "\\Rightarrow ", "+-": "\\pm ", "~~": "\\approx ", "*": "\\cdot ", "<": "<", ">": ">", "=": "=", "+": "+", "-": "-", ",": ",\\,", "!": "!", "|": "|", ":": ":", ";": ";" };
const TOKEN = /\s*(\d+(?:[.,]\d+)?|[A-Za-zА-Яа-яЁё]+|<=|>=|!=|->|=>|\+-|~~|\S)/g;

function tokenize(src: string): string[] {
  let s = src;
  for (const [k, v] of Object.entries(UNI)) s = s.split(k).join(` ${v} `);
  const out: string[] = [];
  for (const m of s.matchAll(TOKEN)) out.push(RU[m[1].toLowerCase()] ?? m[1]);
  return out;
}

type Atom = { tex: string; group?: boolean; inner?: string };

export function toTex(input: string): string {
  const src = (input ?? "").trim();
  if (!src) return "";
  if (src.includes("\\")) return src;
  const t = tokenize(src);
  let i = 0;
  const peek = () => t[i];
  const body = (a: Atom) => (a.group ? a.inner! : a.tex);
  function seq(stops: string[]): string {
    const items: Atom[] = [];
    while (i < t.length && !stops.includes(peek())) {
      if (peek() === "/") {
        i++;
        const num = items.pop() ?? { tex: "" };
        const den = post();
        items.push({ tex: `\\frac{${body(num)}}{${body(den)}}` });
        continue;
      }
      items.push(post());
    }
    return items.map((x) => x.tex).join(" ");
  }
  function args(): string[] {
    const list = [seq([",", ")"])];
    while (peek() === ",") { i++; list.push(seq([",", ")"])); }
    if (peek() === ")") i++;
    return list;
  }
  function post(): Atom {
    let a = atom();
    for (;;) {
      const p = peek();
      if (p === "^" || p === "_") { i++; const b = atom(); a = { tex: `${a.tex}${p}{${body(b)}}` }; }
      else if (p === "'") { i++; a = { tex: `${a.tex}'` }; }
      else break;
    }
    return a;
  }
  function atom(): Atom {
    const v = t[i++];
    if (v === undefined) return { tex: "" };
    if (v === "(") { const inner = seq([")"]); if (peek() === ")") i++; return { tex: `\\left(${inner}\\right)`, group: true, inner }; }
    if (v === "[") { const inner = seq(["]"]); if (peek() === "]") i++; return { tex: `\\left[${inner}\\right]`, group: true, inner }; }
    if (/^[A-Za-z]+$/.test(v)) {
      const call = peek() === "(";
      if (call && v === "sqrt") { i++; return { tex: `\\sqrt{${args()[0]}}` }; }
      if (call && v === "root") { i++; const a = args(); return { tex: `\\sqrt[${a[0]}]{${a[1] ?? ""}}` }; }
      if (call && v === "abs") { i++; return { tex: `\\left|${args()[0]}\\right|` }; }
      if (call && v === "vec") { i++; return { tex: `\\vec{${args()[0]}}` }; }
      if (call && (v === "sum" || v === "int" || v === "prod")) {
        i++; const a = args();
        return { tex: `\\${v}${a[0] ? `_{${a[0]}}` : ""}${a[1] ? `^{${a[1]}}` : ""} ` };
      }
      if (call && v === "lim") { i++; return { tex: `\\lim_{${args()[0]}} ` }; }
      if (v === "sqrt") return { tex: `\\sqrt{${body(post())}}` };
      if (v === "sum" || v === "int" || v === "lim" || v === "prod") return { tex: `\\${v} ` };
      if (v === "inf" || v === "infinity") return { tex: "\\infty " };
      if (GREEK.has(v)) return { tex: `\\${v} ` };
      if (v === "deg") return { tex: "^{\\circ}" };
      const head = FUNCS.has(v) ? `\\${v} ` : v;
      // f(x), sin(x): a name glued to brackets is one unit, so f(x)/2 is a whole fraction
      if (call) return { tex: head + atom().tex };
      return { tex: head };
    }
    if (/^[А-Яа-яЁё]+$/.test(v)) return { tex: `\\text{${v}}` };
    if (/^\d/.test(v)) return { tex: v.replace(",", "{,}") };
    if (OPS[v] !== undefined) return { tex: OPS[v] };
    if (v === "{" || v === "}") return { tex: `\\${v}` };
    return { tex: v };
  }
  return seq([]);
}

/** Buttons above the formula input: label, title, inserted text, caret offset inside it. */
export const MATH_KEYS: [string, string, string, number?][] = [
  ["a/b", "Дробь", "()/()", 1], ["xⁿ", "Степень", "^()", 2], ["xᵢ", "Индекс", "_()", 2], ["√", "Корень", "sqrt()", 5],
  ["|x|", "Модуль", "abs()", 4], ["∑", "Сумма", "sum(i=1, n) ", 12], ["∫", "Интеграл", "int(a, b) ", 10], ["lim", "Предел", "lim(x->0) ", 10],
  ["π", "Пи", "pi "], ["α", "Альфа", "alpha "], ["∞", "Бесконечность", "inf "], ["≤", "Меньше или равно", " <= "], ["≠", "Не равно", " != "], ["→", "Стремится", " -> "], ["±", "Плюс-минус", " +- "],
];

/** Insert a math key into a text field value, wrapping the selection into the brackets when there are any. */
export function insertMathKey(value: string, start: number, end: number, key: [string, string, string, number?]): { value: string; caret: number } {
  let ins = key[2], caret = key[3] ?? ins.length;
  const sel = value.slice(start, end);
  if (sel && ins.includes("()")) {
    ins = ins.replace("()", `(${sel})`);
    caret = ins.includes("()") ? ins.indexOf("()") + 1 : ins.length;
  }
  return { value: value.slice(0, start) + ins + value.slice(end), caret: start + caret };
}

const PLOT_WORDS = new Set(["x", "sin", "cos", "tan", "sqrt", "abs", "ln", "log", "exp", "pi", "e", "asin", "acos", "atan"]);
const MATH_FNS: Record<string, (x: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log, exp: Math.exp, asin: Math.asin, acos: Math.acos, atan: Math.atan };

/**
 * y = f(x) for the plot widget. A small recursive-descent parser over a whitelist of names:
 * no eval, so a page shared with others cannot run code through a formula.
 */
export function compileFn(input: string): ((x: number) => number) | null {
  const s = String(input ?? "").toLowerCase().replace(/^\s*y\s*=\s*/, "").replace(/,/g, ".").replace(/π/g, "pi").replace(/√/g, "sqrt").replace(/[·×]/g, "*").replace(/\|([^|]+)\|/g, "abs($1)");
  if (!s.trim() || !/^[0-9a-z+\-*/^().\s]*$/.test(s)) return null;
  const toks = s.match(/\d+(?:\.\d+)?|[a-z]+|\S/g) ?? [];
  for (const w of toks) if (/^[a-z]+$/.test(w) && !PLOT_WORDS.has(w)) return null;
  type Node = (x: number) => number;
  let i = 0;
  const peek = () => toks[i];
  const fail = () => { throw new Error("parse"); };
  function expr(): Node {
    let a = term();
    while (peek() === "+" || peek() === "-") { const op = toks[i++], l = a, r = term(); a = op === "+" ? (x) => l(x) + r(x) : (x) => l(x) - r(x); }
    return a;
  }
  function startsFactor(t: string | undefined) { return t !== undefined && (t === "(" || /^[a-z0-9]/.test(t)); }
  function term(): Node {
    let a = unary();
    for (;;) {
      const p = peek();
      if (p === "*" || p === "/") { i++; const l = a, r = unary(); a = p === "*" ? (x) => l(x) * r(x) : (x) => l(x) / r(x); }
      else if (startsFactor(p)) { const l = a, r = power(); a = (x) => l(x) * r(x); } // 2x, 3(x+1), (x+1)(x-1)
      else return a;
    }
  }
  function unary(): Node {
    if (peek() === "-") { i++; const a = unary(); return (x) => -a(x); }
    if (peek() === "+") { i++; return unary(); }
    return power();
  }
  function power(): Node {
    const base = primary();
    if (peek() === "^") { i++; const e = unary(); return (x) => Math.pow(base(x), e(x)); }
    return base;
  }
  function primary(): Node {
    const t = toks[i++];
    if (t === undefined) fail();
    if (t === "(") { const a = expr(); if (toks[i++] !== ")") fail(); return a; }
    if (/^\d/.test(t)) { const v = Number(t); return () => v; }
    if (t === "x") return (x) => x;
    if (t === "pi") return () => Math.PI;
    if (t === "e") return () => Math.E;
    const fn = MATH_FNS[t];
    if (fn) { const arg = peek() === "(" ? primary() : power(); return (x) => fn(arg(x)); }
    return fail();
  }
  try {
    const f = expr();
    if (i !== toks.length) return null;
    f(1);
    return f;
  } catch { return null; }
}

export function niceStep(range: number): number {
  const raw = range / 6, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
}
export const fmtNum = (v: number) => (Math.round(v * 100) / 100).toString().replace(".", ",").replace("-", "−");
