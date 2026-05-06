export function stripMarkdownCodeFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function tryParseObjectFromText(value: string) {
  try {
    const parsed = JSON.parse(stripMarkdownCodeFence(value));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractEmbeddedJsonObject(value: string) {
  const source = stripMarkdownCodeFence(value);

  for (let start = 0; start < source.length; start++) {
    if (source[start] !== "{") {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = start; index < source.length; index++) {
      const char = source[index];

      if (inString) {
        if (escaping) {
          escaping = false;
          continue;
        }

        if (char === "\\") {
          escaping = true;
          continue;
        }

        if (char === '"') {
          inString = false;
        }

        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          return tryParseObjectFromText(source.slice(start, index + 1));
        }
      }
    }
  }

  return null;
}

export function parseLlmOutputObject(error: unknown) {
  const llmOutput =
    typeof (error as { llmOutput?: unknown })?.llmOutput === "string"
      ? (error as { llmOutput: string }).llmOutput
      : null;
  const errorMessage =
    typeof (error as { message?: unknown })?.message === "string"
      ? (error as { message: string }).message
      : null;

  const sources = [llmOutput, errorMessage].filter((value): value is string => Boolean(value));

  for (const source of sources) {
    const parsed = tryParseObjectFromText(source) ?? extractEmbeddedJsonObject(source);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function coerceObjectArray(value: unknown): Record<string, unknown>[] {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
    );
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = stripMarkdownCodeFence(value);
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
        )
      : [];
  } catch {
    return [];
  }
}

export function coerceStringArray(value: unknown): string[] {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item)))
      .filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = stripMarkdownCodeFence(value);
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === "string" ? item.trim() : String(item)))
        .filter(Boolean);
    }
  } catch {
    // Ignore and fall back to plain-string splitting below.
  }

  return trimmed
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function coerceNullableStringArray(value: unknown): string[] | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = stripMarkdownCodeFence(value);
    if (!trimmed || ["null", "none"].includes(trimmed.toLowerCase())) {
      return null;
    }
  }

  return coerceStringArray(value);
}

export function coerceString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value.trim() || fallback;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
}

export function coerceNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || ["null", "none"].includes(trimmed.toLowerCase())) {
      return null;
    }
    return trimmed;
  }

  return String(value);
}

export function coerceBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "0"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

export function coerceEnumString<T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
  fallback: T[number],
): T[number] {
  const normalized = coerceString(value, fallback);
  return (allowedValues as readonly string[]).includes(normalized)
    ? (normalized as T[number])
    : fallback;
}
