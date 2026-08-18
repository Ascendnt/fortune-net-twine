/**
 * A flag emoji is just two Unicode "regional indicator symbol" characters,
 * one per letter of the ISO code — 🇵🇭 is literally REGIONAL INDICATOR
 * SYMBOL LETTER P + LETTER H. Deriving it from the code at render time
 * means one small, correct function instead of 185 hand-typed emoji
 * characters, which are exactly the kind of thing that's easy to get
 * subtly wrong (or mis-paste) one-by-one and hard to spot by eye afterward.
 */
export function flagEmoji(isoCode: string): string {
  const codePoints = isoCode
    .toUpperCase()
    .split("")
    .map((letter) => 0x1f1e6 + (letter.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
}
