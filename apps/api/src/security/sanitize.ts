// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const BIDI_CHARS = /[\u202A-\u202E\u2066-\u2069]/g;
const SCRIPT_TAG = /<\s*\/\s*script\b[^>]*>/gi;

const escapeAngleBrackets = (value: string) => value.replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type SanitizationResult = {
  original: string;
  sanitized: string;
  truncated: boolean;
  removedCharacters: boolean;
};

export const sanitizeUserInput = (input: string, maxLength = 4000): SanitizationResult => {
  const original = input ?? "";
  let sanitized = original;

  sanitized = sanitized.replace(CONTROL_CHARS, "");
  sanitized = sanitized.replace(BIDI_CHARS, "");
  sanitized = sanitized.replace(SCRIPT_TAG, "");
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  const removedCharacters = sanitized !== original;

  sanitized = escapeAngleBrackets(sanitized);

  let truncated = false;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
    truncated = true;
  }

  return { original, sanitized, truncated, removedCharacters };
};
