/**
 * Minimal ZIP writer (PKZIP "stored" method, no compression), so that several output files can be
 * downloaded as one package without any library. File names are written as UTF-8 (general purpose flag
 * bit 11). Pure function over bytes: works in every browser and in Node.
 */

export interface ZipEntry {
  name: string;
  data: string | Uint8Array;
}

const TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = (TABLE[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date and time of a JavaScript date (local time as ZIP defines it, minimum 1980). */
function dosDateTime(d: Date): { date: number; time: number } {
  const y = Math.max(1980, d.getFullYear());
  return {
    date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  };
}

const u16 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

export function buildZip(entries: readonly ZipEntry[], now: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const { date, time } = dosDateTime(now);
  const chunks: Uint8Array[] = [];
  const central: number[] = [];
  let offset = 0;
  const names = new Set<string>();
  for (const e of entries) {
    if (names.has(e.name) || e.name === "" || /^[/\\]|\.\.|[\0]/.test(e.name)) throw new Error(`invalid or duplicate zip entry name: ${e.name}`);
    names.add(e.name);
    const name = enc.encode(e.name);
    const data = typeof e.data === "string" ? enc.encode(e.data) : e.data;
    const crc = crc32(data);
    const local = Uint8Array.from([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    chunks.push(local, name, data);
    central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name);
    offset += local.length + name.length + data.length;
  }
  const end = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(central.length), ...u32(offset), ...u16(0)]);
  const total = offset + central.length + end.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  out.set(central, p);
  out.set(end, p + central.length);
  return out;
}
