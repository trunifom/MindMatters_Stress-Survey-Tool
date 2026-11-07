/**
 * Resource limits applied while reading untrusted JSON (spec C09).
 * The concrete values are PROVISIONAL: they must be fixed, tested and
 * documented before acceptance (docs/ENTSCHEIDUNGEN.md, open decisions).
 */
export interface Limits {
  /** Maximum size of the raw text in UTF-8 bytes. */
  maxBytes: number;
  /** Maximum nesting depth of arrays/objects. */
  maxDepth: number;
  /** Maximum number of JSON values (nodes) in the document. */
  maxNodes: number;
  /** Maximum length of one string in UTF-16 code units. */
  maxStringLength: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxBytes: 10 * 1024 * 1024,
  maxDepth: 32,
  maxNodes: 1_000_000,
  maxStringLength: 100_000,
};
