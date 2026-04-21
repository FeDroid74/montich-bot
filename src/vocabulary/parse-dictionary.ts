export interface ParsedDictionaryEntry {
  serbianLatin: string;
  russianTranslation: string;
  sourceLineNumber: number;
}

export interface SkippedDictionaryLine {
  lineNumber: number;
  rawLine: string;
  reason: string;
}

export interface ParsedDictionaryResult {
  entries: ParsedDictionaryEntry[];
  skippedLines: SkippedDictionaryLine[];
}

const separatorPattern = /\s*[\-–—]\s*/;

export function parseDictionaryText(text: string): ParsedDictionaryResult {
  const entries: ParsedDictionaryEntry[] = [];
  const skippedLines: SkippedDictionaryLine[] = [];

  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const rawLine = line.trim();

    if (!rawLine) {
      return;
    }

    const match = separatorPattern.exec(rawLine);

    if (!match || match.index < 1) {
      skippedLines.push({
        lineNumber,
        rawLine,
        reason: "separator not found",
      });
      return;
    }

    const leftPart = rawLine.slice(0, match.index).trim();
    const rightPart = rawLine.slice(match.index + match[0].length).trim();

    if (!leftPart || !rightPart) {
      skippedLines.push({
        lineNumber,
        rawLine,
        reason: "entry or translation is empty",
      });
      return;
    }

    entries.push({
      serbianLatin: leftPart,
      russianTranslation: rightPart,
      sourceLineNumber: lineNumber,
    });
  });

  return {
    entries,
    skippedLines,
  };
}
