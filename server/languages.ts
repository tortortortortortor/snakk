/** whisper.cpp reports full language names ("norwegian"); everything else in snakk uses ISO-639-1. */
const NAME_TO_CODE: Record<string, string> = {
  english: 'en', norwegian: 'no', nynorsk: 'nn', 'norwegian nynorsk': 'nn', swedish: 'sv', danish: 'da',
  german: 'de', french: 'fr', spanish: 'es', italian: 'it', dutch: 'nl', finnish: 'fi', icelandic: 'is',
  polish: 'pl', portuguese: 'pt', russian: 'ru', ukrainian: 'uk', japanese: 'ja', chinese: 'zh', korean: 'ko',
  arabic: 'ar', hindi: 'hi', turkish: 'tr', greek: 'el', czech: 'cs', estonian: 'et', latvian: 'lv',
  lithuanian: 'lt', welsh: 'cy', irish: 'ga', latin: 'la',
};

export function toIsoLanguage(value: string | undefined | null): string {
  if (!value) return 'und';
  const v = value.trim().toLowerCase();
  if (v.length <= 3) return v === 'nb' ? 'no' : v;
  return NAME_TO_CODE[v] ?? 'und';
}

export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? 'no,en')
    .split(',')
    .map((s) => toIsoLanguage(s))
    .filter((s) => s && s !== 'und');
}

/** Norwegian Bokmål and Nynorsk are both "Norwegian" for our purposes. */
export function isAllowed(lang: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  if (allowlist.includes(lang)) return true;
  if ((lang === 'nn' || lang === 'no') && (allowlist.includes('no') || allowlist.includes('nn'))) return true;
  return false;
}
