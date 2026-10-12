/**
 * A small spreadsheet engine: cells hold text; text starting with "=" is a formula.
 * No eval: formulas are tokenised and parsed here. Numbers, text, true/false, cell and range references,
 * + - * / ^ & comparisons, and the common functions. Arabic digits and the Arabic comma/semicolon are accepted.
 */
export type Value = number | string | boolean | SheetError;
export class SheetError {
  constructor(public code: '#DIV/0!' | '#NAME?' | '#REF!' | '#VALUE!' | '#CIRC!' | '#ERROR!') {}
  toString() {
    return this.code;
  }
}

export type Cells = Record<string, string>;

export const MAX_COLS = 26;
export const MAX_ROWS = 200;

export const colName = (c: number): string => {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
export const colIndex = (s: string): number => [...s.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
export const cellKey = (c: number, r: number): string => `${colName(c)}${r + 1}`;
export function parseKey(key: string): { c: number; r: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,5})$/.exec(key);
  return m ? { c: colIndex(m[1]), r: Number(m[2]) - 1 } : null;
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
/** Arabic-Indic digits and separators to their ASCII form (outside text in quotes). */
export function normalizeInput(src: string): string {
  let out = '';
  let quoted = false;
  for (const ch of src) {
    if (ch === '"') quoted = !quoted;
    const d = ARABIC_DIGITS.indexOf(ch);
    if (!quoted && d >= 0) out += String(d);
    else if (!quoted && ch === '٫') out += '.';
    else if (!quoted && (ch === '؛' || ch === '،')) out += ch === '؛' ? ';' : ',';
    else out += ch;
  }
  return out;
}

type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && !(src[j] === '"' && src[j + 1] !== '"')) {
        if (src[j] === '"') j++; // "" inside text is one quote
        s += src[j];
        j++;
      }
      if (j >= src.length) throw new SheetError('#ERROR!');
      out.push({ t: 'str', v: s });
      i = j + 1;
    } else if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new SheetError('#ERROR!');
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_$]/.test(ch)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_.$]*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
    } else {
      const two = src.slice(i, i + 2);
      if (['<=', '>=', '<>'].includes(two)) {
        out.push({ t: 'op', v: two });
        i += 2;
      } else if ('+-*/^&=<>(),:;%'.includes(ch)) {
        out.push({ t: 'op', v: ch === ';' ? ',' : ch });
        i++;
      } else throw new SheetError('#ERROR!');
    }
  }
  return out;
}

type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'ref'; key: string }
  | { k: 'range'; a: string; b: string }
  | { k: 'un'; op: string; x: Node }
  | { k: 'pct'; x: Node }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'fn'; name: string; args: Node[] };

function parse(tokens: Tok[]): Node {
  let p = 0;
  const peek = () => tokens[p];
  const eat = (v?: string) => {
    const t = tokens[p];
    if (!t || (v !== undefined && !(t.t === 'op' && t.v === v))) throw new SheetError('#ERROR!');
    p++;
    return t;
  };
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v;

  const level = (ops: string[], next: () => Node) => (): Node => {
    let l = next();
    while (peek()?.t === 'op' && ops.includes((peek() as { v: string }).v)) {
      const op = (eat() as { v: string }).v;
      l = { k: 'bin', op, l, r: next() };
    }
    return l;
  };
  const primary = (): Node => {
    const t = peek();
    if (!t) throw new SheetError('#ERROR!');
    if (t.t === 'num') {
      p++;
      return { k: 'num', v: t.v };
    }
    if (t.t === 'str') {
      p++;
      return { k: 'str', v: t.v };
    }
    if (t.t === 'op' && t.v === '(') {
      p++;
      const e = compare();
      eat(')');
      return e;
    }
    if (t.t === 'id') {
      p++;
      const up = t.v.toUpperCase();
      if (isOp('(')) {
        p++;
        const args: Node[] = [];
        if (!isOp(')')) {
          args.push(compare());
          while (isOp(',')) {
            p++;
            args.push(compare());
          }
        }
        eat(')');
        return { k: 'fn', name: up, args };
      }
      if (up === 'TRUE' || up === 'FALSE') return { k: 'bool', v: up === 'TRUE' };
      const ref = parseKey(t.v);
      if (!ref) throw new SheetError('#NAME?');
      if (isOp(':')) {
        p++;
        const b = peek();
        if (!b || b.t !== 'id' || !parseKey(b.v)) throw new SheetError('#REF!');
        p++;
        return { k: 'range', a: t.v.replace(/\$/g, '').toUpperCase(), b: b.v.replace(/\$/g, '').toUpperCase() };
      }
      return { k: 'ref', key: t.v.replace(/\$/g, '').toUpperCase() };
    }
    throw new SheetError('#ERROR!');
  };
  const postfix = (): Node => {
    let x = primary();
    while (isOp('%')) {
      p++;
      x = { k: 'pct', x };
    }
    return x;
  };
  const unary = (): Node => {
    if (isOp('-') || isOp('+')) {
      const op = (eat() as { v: string }).v;
      return { k: 'un', op, x: unary() };
    }
    return postfix();
  };
  const power = (): Node => {
    const l = unary();
    if (isOp('^')) {
      p++;
      return { k: 'bin', op: '^', l, r: power() };
    }
    return l;
  };
  const mul = level(['*', '/'], power);
  const add = level(['+', '-'], mul);
  const concat = level(['&'], add);
  const compare = level(['=', '<>', '<', '>', '<=', '>='], concat);
  const root = compare();
  if (p < tokens.length) throw new SheetError('#ERROR!');
  return root;
}

const isErr = (v: unknown): v is SheetError => v instanceof SheetError;

/** What a cell's text means as a plain value (no formulas). */
export function literal(raw: string): Value {
  const s = normalizeInput(raw).trim();
  if (s === '') return '';
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return Number(s);
  if (/^[+-]?(\d+\.?\d*|\.\d+)%$/.test(s)) return Number(s.slice(0, -1)) / 100;
  if (/^true$/i.test(raw.trim())) return true;
  if (/^false$/i.test(raw.trim())) return false;
  return raw;
}

export class Sheet {
  private memo = new Map<string, Value>();
  private visiting = new Set<string>();
  private parsed = new Map<string, Node | SheetError>();
  constructor(public cells: Cells) {}

  /** The value shown for a cell. */
  get(key: string): Value {
    key = key.toUpperCase();
    if (this.memo.has(key)) return this.memo.get(key)!;
    const raw = this.cells[key] ?? '';
    let v: Value;
    if (raw.startsWith('=')) {
      if (this.visiting.has(key)) return new SheetError('#CIRC!');
      this.visiting.add(key);
      try {
        v = this.evalFormula(key, raw.slice(1));
      } finally {
        this.visiting.delete(key);
      }
    } else v = literal(raw);
    this.memo.set(key, v);
    return v;
  }

  private evalFormula(key: string, src: string): Value {
    let node = this.parsed.get(key);
    if (node === undefined) {
      try {
        node = parse(tokenize(normalizeInput(src)));
      } catch (e) {
        node = e instanceof SheetError ? e : new SheetError('#ERROR!');
      }
      this.parsed.set(key, node);
    }
    if (node instanceof SheetError) return node;
    try {
      const v = this.ev(node);
      return Array.isArray(v) ? (v[0] ?? '') : v;
    } catch (e) {
      return e instanceof SheetError ? e : new SheetError('#ERROR!');
    }
  }

  private rangeKeys(a: string, b: string): string[] {
    const pa = parseKey(a)!;
    const pb = parseKey(b)!;
    const keys: string[] = [];
    for (let r = Math.min(pa.r, pb.r); r <= Math.max(pa.r, pb.r); r++) for (let c = Math.min(pa.c, pb.c); c <= Math.max(pa.c, pb.c); c++) keys.push(cellKey(c, r));
    if (keys.length > MAX_COLS * MAX_ROWS) throw new SheetError('#REF!');
    return keys;
  }

  private num(v: Value): number {
    if (isErr(v)) throw v;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === '') return 0;
    const l = literal(v);
    if (typeof l === 'number') return l;
    throw new SheetError('#VALUE!');
  }
  private text(v: Value): string {
    if (isErr(v)) throw v;
    return typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
  }
  private truthy(v: Value): boolean {
    if (isErr(v)) throw v;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (/^true$/i.test(v)) return true;
    if (/^false$/i.test(v) || v === '') return false;
    throw new SheetError('#VALUE!');
  }

  /** The values a function argument stands for: every cell of a range, or the single value. */
  private flat(n: Node): Value[] {
    if (n.k === 'range') return this.rangeKeys(n.a, n.b).map((k) => this.get(k));
    const v = this.ev(n);
    return Array.isArray(v) ? v : [v];
  }
  private numbers(args: Node[]): number[] {
    const out: number[] = [];
    for (const a of args) {
      const inRange = a.k === 'range';
      for (const v of this.flat(a)) {
        if (isErr(v)) throw v;
        if (inRange) {
          if (typeof v === 'number') out.push(v);
          else if (typeof v === 'boolean' || v === '') continue;
          else {
            const l = literal(v);
            if (typeof l === 'number') out.push(l);
          }
        } else out.push(this.num(v));
      }
    }
    return out;
  }

  private ev(n: Node): Value | Value[] {
    switch (n.k) {
      case 'num':
      case 'str':
      case 'bool':
        return n.v;
      case 'ref':
        return this.get(n.key);
      case 'range':
        return this.rangeKeys(n.a, n.b).map((k) => this.get(k));
      case 'un': {
        const x = this.scalar(n.x);
        return n.op === '-' ? -this.num(x) : this.num(x);
      }
      case 'pct':
        return this.num(this.scalar(n.x)) / 100;
      case 'bin': {
        const l = this.scalar(n.l);
        const r = this.scalar(n.r);
        if (isErr(l)) throw l;
        if (isErr(r)) throw r;
        switch (n.op) {
          case '+':
            return this.num(l) + this.num(r);
          case '-':
            return this.num(l) - this.num(r);
          case '*':
            return this.num(l) * this.num(r);
          case '/': {
            const d = this.num(r);
            if (d === 0) throw new SheetError('#DIV/0!');
            return this.num(l) / d;
          }
          case '^':
            return Math.pow(this.num(l), this.num(r));
          case '&':
            return this.text(l) + this.text(r);
          default:
            return this.compare(n.op, l, r);
        }
      }
      case 'fn':
        return this.call(n.name, n.args);
    }
  }
  private scalar(n: Node): Value {
    const v = this.ev(n);
    return Array.isArray(v) ? (v[0] ?? '') : v;
  }

  private compare(op: string, l: Value, r: Value): boolean {
    const both = typeof l === 'number' && typeof r === 'number';
    const a = both ? l : typeof l === 'string' || typeof r === 'string' ? String(l).toLowerCase() : this.num(l);
    const b = both ? r : typeof l === 'string' || typeof r === 'string' ? String(r).toLowerCase() : this.num(r);
    switch (op) {
      case '=':
        return a === b;
      case '<>':
        return a !== b;
      case '<':
        return a < b;
      case '>':
        return a > b;
      case '<=':
        return a <= b;
      default:
        return a >= b;
    }
  }

  private call(name: string, args: Node[]): Value {
    const need = (min: number, max = min) => {
      if (args.length < min || args.length > max) throw new SheetError('#VALUE!');
    };
    const s = (i: number) => this.scalar(args[i]);
    switch (name) {
      case 'SUM':
        return this.numbers(args).reduce((a, b) => a + b, 0);
      case 'AVERAGE': {
        const x = this.numbers(args);
        if (x.length === 0) throw new SheetError('#DIV/0!');
        return x.reduce((a, b) => a + b, 0) / x.length;
      }
      case 'MIN': {
        const x = this.numbers(args);
        return x.length ? Math.min(...x) : 0;
      }
      case 'MAX': {
        const x = this.numbers(args);
        return x.length ? Math.max(...x) : 0;
      }
      case 'COUNT':
        return this.numbers(args).length;
      case 'COUNTA':
        return args.flatMap((a) => this.flat(a)).filter((v) => v !== '').length;
      case 'ROUND': {
        need(1, 2);
        const f = Math.pow(10, args.length > 1 ? this.num(s(1)) : 0);
        const x = this.num(s(0)) * f;
        return (Math.sign(x) * Math.round(Math.abs(x))) / f;
      }
      case 'ABS':
        need(1);
        return Math.abs(this.num(s(0)));
      case 'SQRT': {
        need(1);
        const x = this.num(s(0));
        if (x < 0) throw new SheetError('#VALUE!');
        return Math.sqrt(x);
      }
      case 'INT':
        need(1);
        return Math.floor(this.num(s(0)));
      case 'MOD': {
        need(2);
        const d = this.num(s(1));
        if (d === 0) throw new SheetError('#DIV/0!');
        const x = this.num(s(0));
        return x - d * Math.floor(x / d);
      }
      case 'POWER':
        need(2);
        return Math.pow(this.num(s(0)), this.num(s(1)));
      case 'IF':
        need(2, 3);
        return this.truthy(s(0)) ? s(1) : args.length > 2 ? s(2) : false;
      case 'AND':
        return args.flatMap((a) => this.flat(a)).every((v) => this.truthy(v));
      case 'OR':
        return args.flatMap((a) => this.flat(a)).some((v) => this.truthy(v));
      case 'NOT':
        need(1);
        return !this.truthy(s(0));
      case 'CONCAT':
      case 'CONCATENATE':
        return args.flatMap((a) => this.flat(a)).map((v) => this.text(v)).join('');
      case 'LEN':
        need(1);
        return this.text(s(0)).length;
      case 'UPPER':
        need(1);
        return this.text(s(0)).toUpperCase();
      case 'LOWER':
        need(1);
        return this.text(s(0)).toLowerCase();
      case 'TRIM':
        need(1);
        return this.text(s(0)).trim().replace(/\s+/g, ' ');
      case 'SUMIF':
      case 'COUNTIF': {
        need(name === 'SUMIF' ? 2 : 2, name === 'SUMIF' ? 3 : 2);
        const test = this.criteria(s(1));
        const range = this.flat(args[0]);
        const sums = name === 'SUMIF' && args.length > 2 ? this.flat(args[2]) : range;
        let total = 0;
        range.forEach((v, i) => {
          if (!isErr(v) && test(v)) total += name === 'COUNTIF' ? 1 : typeof sums[i] === 'number' ? (sums[i] as number) : 0;
        });
        return total;
      }
      default:
        throw new SheetError('#NAME?');
    }
  }

  /** "">5", "=x", "apple" … as a test on a cell value. */
  private criteria(c: Value): (v: Value) => boolean {
    if (typeof c === 'number') return (v) => v === c;
    const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(String(c))!;
    const op = m[1] ?? '=';
    const lit = literal(m[2]);
    return (v) => {
      if (typeof lit === 'number') return typeof v === 'number' && this.compare(op, v, lit);
      return typeof v !== 'number' && this.compare(op, String(v), String(lit));
    };
  }
}

/** Text shown in a cell for a value. */
export function display(v: Value): string {
  if (isErr(v)) return v.code;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10);
  return v;
}

export function evaluate(cells: Cells): Map<string, Value> {
  const sheet = new Sheet(cells);
  const out = new Map<string, Value>();
  for (const k of Object.keys(cells)) if (cells[k] !== '') out.set(k, sheet.get(k));
  return out;
}
