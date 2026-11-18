const SECRET_PATTERNS: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)["']?\s*[:=]\s*["']?[^\s,"'}]+/gi,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
];
export function redactSensitiveText(input: string): string {
  return SECRET_PATTERNS.reduce((value, pattern) => value.replace(pattern, "[REDACTED]"), input);
}
