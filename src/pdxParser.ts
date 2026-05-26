export type PdxValue = string | PdxObject;

export interface PdxAssignment {
  key: string;
  value: PdxValue;
}

export interface PdxObject {
  assignments: PdxAssignment[];
  values: PdxValue[];
}

type TokenType = "word" | "string" | "equals" | "open" | "close" | "eof";

interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export class PdxParseError extends Error {
  constructor(message: string, readonly line: number, readonly column: number) {
    super(`${message} at ${line}:${column}`);
    this.name = "PdxParseError";
  }
}

class Tokenizer {
  private index = 0;
  private line = 1;
  private column = 1;
  private readonly buffered: Token[] = [];

  constructor(private readonly input: string) {}

  peek(offset = 0): Token {
    while (this.buffered.length <= offset) {
      this.buffered.push(this.readToken());
    }

    return this.buffered[offset]!;
  }

  next(): Token {
    const token = this.peek();
    this.buffered.shift();
    return token;
  }

  private readToken(): Token {
    this.skipWhitespaceAndComments();

    const line = this.line;
    const column = this.column;
    const char = this.current();

    if (char === undefined) {
      return { type: "eof", value: "", line, column };
    }

    if (char === "=") {
      this.advance();
      return { type: "equals", value: char, line, column };
    }

    if (char === "{") {
      this.advance();
      return { type: "open", value: char, line, column };
    }

    if (char === "}") {
      this.advance();
      return { type: "close", value: char, line, column };
    }

    if (char === "\"") {
      return this.readString();
    }

    return this.readWord();
  }

  private skipWhitespaceAndComments(): void {
    while (true) {
      const char = this.current();

      if (char === undefined) {
        return;
      }

      if (/\s/.test(char)) {
        this.advance();
        continue;
      }

      if (char === "#") {
        while (this.current() !== undefined && this.current() !== "\n") {
          this.advance();
        }
        continue;
      }

      return;
    }
  }

  private readString(): Token {
    const line = this.line;
    const column = this.column;
    let value = "";

    this.expectCurrent("\"");

    while (true) {
      const char = this.current();

      if (char === undefined) {
        throw new PdxParseError("Unterminated string", line, column);
      }

      if (char === "\"") {
        this.advance();
        return { type: "string", value, line, column };
      }

      if (char === "\\") {
        this.advance();
        const escaped = this.current();

        if (escaped === undefined) {
          throw new PdxParseError("Unterminated escape sequence", this.line, this.column);
        }

        value += escaped;
        this.advance();
        continue;
      }

      value += char;
      this.advance();
    }
  }

  private readWord(): Token {
    const line = this.line;
    const column = this.column;
    let value = "";

    while (true) {
      const char = this.current();

      if (char === undefined || /\s/.test(char) || char === "=" || char === "{" || char === "}" || char === "#") {
        break;
      }

      value += char;
      this.advance();
    }

    if (value.length === 0) {
      throw new PdxParseError(`Unexpected character ${JSON.stringify(this.current())}`, line, column);
    }

    return { type: "word", value, line, column };
  }

  private expectCurrent(expected: string): void {
    if (this.current() !== expected) {
      throw new PdxParseError(`Expected ${expected}`, this.line, this.column);
    }

    this.advance();
  }

  private current(): string | undefined {
    return this.input[this.index];
  }

  private advance(): void {
    if (this.input[this.index] === "\n") {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }

    this.index += 1;
  }
}

export function parsePdx(input: string): PdxObject {
  const parser = new Parser(input);
  return parser.parseDocument();
}

class Parser {
  private readonly tokenizer: Tokenizer;

  constructor(input: string) {
    this.tokenizer = new Tokenizer(input);
  }

  parseDocument(): PdxObject {
    const root = createPdxObject();

    while (this.tokenizer.peek().type !== "eof") {
      if (this.tokenizer.peek().type === "close") {
        const token = this.tokenizer.peek();
        throw new PdxParseError("Unexpected closing brace", token.line, token.column);
      }

      if (this.isAssignmentAhead()) {
        root.assignments.push(this.parseAssignment());
      } else {
        root.values.push(this.parseValue());
      }
    }

    return root;
  }

  private parseObject(): PdxObject {
    const open = this.tokenizer.next();

    if (open.type !== "open") {
      throw new PdxParseError("Expected opening brace", open.line, open.column);
    }

    const object = createPdxObject();

    while (this.tokenizer.peek().type !== "close") {
      const next = this.tokenizer.peek();

      if (next.type === "eof") {
        throw new PdxParseError("Unterminated object", next.line, next.column);
      }

      if (this.isAssignmentAhead()) {
        object.assignments.push(this.parseAssignment());
      } else {
        object.values.push(this.parseValue());
      }
    }

    this.tokenizer.next();
    return object;
  }

  private parseAssignment(): PdxAssignment {
    const key = this.parseKey();
    const equals = this.tokenizer.next();

    if (equals.type !== "equals") {
      throw new PdxParseError("Expected equals sign", equals.line, equals.column);
    }

    return { key, value: this.parseValue() };
  }

  private parseKey(): string {
    const token = this.tokenizer.next();

    if (token.type !== "word" && token.type !== "string") {
      throw new PdxParseError("Expected key", token.line, token.column);
    }

    return token.value;
  }

  private parseValue(): PdxValue {
    const token = this.tokenizer.peek();

    if (token.type === "open") {
      return this.parseObject();
    }

    if (token.type === "word" || token.type === "string") {
      this.tokenizer.next();
      return token.value;
    }

    throw new PdxParseError("Expected value", token.line, token.column);
  }

  private isAssignmentAhead(): boolean {
    const first = this.tokenizer.peek();
    const second = this.tokenizer.peek(1);

    return (first.type === "word" || first.type === "string") && second.type === "equals";
  }
}

export function createPdxObject(): PdxObject {
  return { assignments: [], values: [] };
}

export function isPdxObject(value: PdxValue | undefined): value is PdxObject {
  return typeof value === "object" && value !== null && "assignments" in value && "values" in value;
}

export function getAssignments(object: PdxObject | undefined, key: string): PdxValue[] {
  if (!object) {
    return [];
  }

  return object.assignments.filter((assignment) => assignment.key === key).map((assignment) => assignment.value);
}

export function getFirst(object: PdxObject | undefined, key: string): PdxValue | undefined {
  return getAssignments(object, key)[0];
}

export function getObject(object: PdxObject | undefined, key: string): PdxObject | undefined {
  const value = getFirst(object, key);
  return isPdxObject(value) ? value : undefined;
}

export function getString(object: PdxObject | undefined, key: string): string | undefined {
  const value = getFirst(object, key);
  return typeof value === "string" ? value : undefined;
}

export function numericValue(value: PdxValue | undefined): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
