/**
 * Deep copy of JSON data.
 *
 * structuredClone is deliberately not used: it is missing in browsers older than
 * early 2022, and all documents here are plain JSON, so a JSON round trip is exact.
 */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
