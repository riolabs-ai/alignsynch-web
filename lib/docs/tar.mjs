/**
 * A deterministic ustar, in one file and no dependency (#1398).
 *
 * The `docs/` tree is published as one archive (`scripts/docs-bundle.ts`), and an archive is only
 * worth hashing if the hash means something: the same tree packed twice must produce the same
 * bytes, so a manifest can name a sha256 and two people can compare their copies. Every archive
 * library in reach fails that quietly — it stamps the wall clock into each entry, or writes
 * entries in whatever order a directory listing returned. So this file writes the format itself,
 * and the four things that decide a hash are fixed here, once:
 *
 *   1. **Entry order** — sorted by the UTF-8 byte order of the path. Not `readdir` order.
 *   2. **Modification time** — one constant for every entry (`2020-01-01T00:00:00Z`). A real
 *      mtime would make two packs of one tree differ.
 *   3. **Ownership and mode** — uid/gid `0`, no user or group name, mode `0644`, no device
 *      numbers. A checkout's file modes are the checkout's business, not the artifact's.
 *   4. **No directory entries, no PAX headers, no GNU extensions** — the archive is regular files
 *      and nothing else, one 512-byte header each, so a reader needs no state and no seek.
 *
 * Compression is deliberately not here: `node:zlib`'s zstd does that on both sides, and keeping
 * the codec pure means `tests/docs-source.test.ts` can round-trip an archive without a disk.
 *
 * Why `.mjs` and not `.ts`: two callers run under plain node with no loader — the bundler script
 * (`scripts/docs-bundle.ts`, run as `node scripts/docs-bundle.ts`) and CI — and one of them, the
 * reader in `lib/docs/source.ts`, is bundled by Next. A `.mjs` module is the one shape both reach:
 * node resolves it by extension, and TypeScript resolves it under `allowJs` with the JSDoc types
 * below. The alternative was two copies of a 512-byte header layout, which is how archives drift.
 *
 * What it deliberately does not do: paths longer than 255 bytes (ustar's `prefix`/`name` split),
 * files above 8 GiB (ustar sizes are 11 octal digits), symlinks, hard links, devices and sparse
 * files. Each is refused with a message rather than mis-written, because the `docs/` tree has none
 * of them and a reader that quietly guesses is worse than one that says no.
 */

/** One regular file in an archive. */
/**
 * @typedef {object} TarEntry
 * @property {string} path       repo-relative, `/`-separated, no `..` segment
 * @property {Uint8Array} bytes  the file's whole contents
 */

/** Every entry carries this timestamp: 2020-01-01T00:00:00Z, in seconds, so two packs agree. */
export const FIXED_MTIME_SECONDS = 1577836800;

/** Regular file, `rw-r--r--`, for every entry. */
const FILE_MODE = 0o644;

const BLOCK = 512;
const NAME_MAX = 100;
const PREFIX_MAX = 155;

/** `value` as a NUL-terminated octal field `width` bytes wide (POSIX: `width - 1` digits). */
/**
 * @param {number} value
 * @param {number} width
 * @returns {string}
 */
function octal(value, width) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`tar: ${value} is not a non-negative integer`);
  }
  const digits = value.toString(8);
  if (digits.length > width - 1) {
    throw new Error(`tar: ${value} does not fit ${width - 1} octal digits`);
  }
  return `${digits.padStart(width - 1, "0")}\0`;
}

/** The checksum of a header block, taken with its own checksum field read as eight spaces. */
/**
 * @param {Uint8Array} block
 * @returns {string}
 */
function octalChecksum(block) {
  let sum = 0;
  for (const byte of block) sum += byte;
  return sum.toString(8).padStart(6, "0");
}

/** A path that stays inside the archive: relative, no empty/`.`/`..` segment, no NUL or `\`. */
/**
 * @param {string} path
 * @returns {string}
 */
function relativePath(path) {
  if (
    path === "" ||
    path.startsWith("/") ||
    path.includes("\0") ||
    path.includes("\\") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`tar: ${JSON.stringify(path)} is not a plain relative path`);
  }
  return path;
}

/**
 * ustar splits a long path into a 155-byte `prefix` and a 100-byte `name` at a `/`. A path that
 * does not fit is refused: PAX headers would be the alternative, and this repo's tree needs none.
 */
/**
 * @param {string} path
 * @returns {{ name: string, prefix: string }}
 */
function splitPath(path) {
  if (Buffer.byteLength(path, "utf8") <= NAME_MAX) return { name: path, prefix: "" };
  for (let index = path.length - 1; index > 0; index -= 1) {
    if (path[index] !== "/") continue;
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (
      Buffer.byteLength(name, "utf8") <= NAME_MAX &&
      Buffer.byteLength(prefix, "utf8") <= PREFIX_MAX
    ) {
      return { name, prefix };
    }
  }
  throw new Error(`tar: ${path} does not fit a ustar header (255 bytes across prefix/name)`);
}

/** One 512-byte header block for `entry`, with its checksum in place. */
/**
 * @param {TarEntry} entry
 * @returns {Buffer}
 */
function headerBlock(entry) {
  const { name, prefix } = splitPath(entry.path);
  const block = Buffer.alloc(BLOCK);
  block.write(name, 0, NAME_MAX, "utf8");
  block.write(octal(FILE_MODE, 8), 100, 8, "ascii");
  block.write(octal(0, 8), 108, 8, "ascii"); // uid
  block.write(octal(0, 8), 116, 8, "ascii"); // gid
  block.write(octal(entry.bytes.byteLength, 12), 124, 12, "ascii");
  block.write(octal(FIXED_MTIME_SECONDS, 12), 136, 12, "ascii");
  // The checksum is taken with the field read as eight spaces, then written over them.
  block.fill(0x20, 148, 156);
  block.write("0", 156, 1, "ascii"); // typeflag: regular file
  block.write("ustar", 257, 5, "ascii"); // magic, then the NUL the alloc already left
  block.write("00", 263, 2, "ascii"); // version
  block.write(prefix, 345, PREFIX_MAX, "utf8");
  block.write(octalChecksum(block), 148, 6, "ascii");
  block[154] = 0;
  block[155] = 0x20;
  return block;
}

/** The text of a NUL-padded header field. */
/**
 * @param {Uint8Array} block
 * @param {number} offset
 * @param {number} width
 * @returns {string}
 */
function fieldText(block, offset, width) {
  const field = block.subarray(offset, offset + width);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString("utf8");
}

/** An octal header field as a number. */
/**
 * @param {Uint8Array} block
 * @param {number} offset
 * @param {number} width
 * @returns {number}
 */
function fieldOctal(block, offset, width) {
  const text = fieldText(block, offset, width).trim();
  if (text === "") return 0;
  if (!/^[0-7]+$/.test(text)) {
    throw new Error(`tar: ${JSON.stringify(text)} is not an octal field`);
  }
  return Number.parseInt(text, 8);
}

/** Does this header block's own checksum match its bytes? */
/**
 * @param {Uint8Array} block
 * @returns {boolean}
 */
function checksumHolds(block) {
  const stored = fieldOctal(block, 148, 8);
  const copy = Buffer.from(block);
  copy.fill(0x20, 148, 156);
  return Number.parseInt(octalChecksum(copy), 8) === stored;
}

/**
 * The bytes of a ustar archive holding exactly `entries`, sorted by path.
 *
 * Sorted here rather than trusted from the caller, because the sort is one of the four decisions a
 * reproducible hash rests on: a caller that walks a directory cannot promise it.
 */
/**
 * @param {readonly TarEntry[]} entries
 * @returns {Buffer}
 */
export function tarEntries(entries) {
  const seen = new Set();
  const parts = [];
  const sorted = [...entries].sort((left, right) =>
    Buffer.compare(Buffer.from(left.path, "utf8"), Buffer.from(right.path, "utf8")),
  );
  for (const entry of sorted) {
    const path = relativePath(entry.path);
    if (seen.has(path)) throw new Error(`tar: ${path} is in the archive twice`);
    seen.add(path);
    const header = headerBlock({ path, bytes: entry.bytes });
    const padding = (BLOCK - (entry.bytes.byteLength % BLOCK)) % BLOCK;
    parts.push(header, Buffer.from(entry.bytes), Buffer.alloc(padding));
  }
  // End of archive: two zero blocks, so a reader knows the last file was the last file.
  parts.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(parts);
}

/**
 * The files inside a ustar archive, in archive order — views into `archive`, not copies.
 *
 * Everything that would make the result depend on a damaged header is refused by name: a checksum
 * that does not hold, a size that runs past the end of the buffer, a truncated archive with no end
 * marker, or an entry type this codec does not write.
 */
/**
 * @param {Buffer | Uint8Array} archive
 * @returns {TarEntry[]}
 */
export function untarEntries(archive) {
  const buffer = Buffer.isBuffer(archive)
    ? archive
    : Buffer.from(archive.buffer, archive.byteOffset, archive.byteLength);
  /** @type {TarEntry[]} */
  const entries = [];
  let offset = 0;
  let terminated = false;
  while (offset + BLOCK <= buffer.length) {
    const block = buffer.subarray(offset, offset + BLOCK);
    if (block.every((byte) => byte === 0)) {
      terminated = true;
      break;
    }
    if (!checksumHolds(block)) {
      throw new Error(`tar: the header at byte ${offset} fails its checksum`);
    }
    const type = String.fromCharCode(block[156]);
    const size = fieldOctal(block, 124, 12);
    const name = fieldText(block, 0, NAME_MAX);
    const prefix = fieldText(block, 345, PREFIX_MAX);
    const path = relativePath(prefix === "" ? name : `${prefix}/${name}`);
    offset += BLOCK;
    if (offset + size > buffer.length) {
      throw new Error(`tar: ${path} claims ${size} bytes and the archive ends before them`);
    }
    if (type === "0" || type === "\0") {
      entries.push({ path, bytes: buffer.subarray(offset, offset + size) });
    } else if (type !== "5") {
      throw new Error(`tar: ${path} is a type ${JSON.stringify(type)} entry — regular files only`);
    }
    offset += Math.ceil(size / BLOCK) * BLOCK;
  }
  if (!terminated) {
    throw new Error("tar: the archive has no end-of-archive marker (two zero blocks)");
  }
  return entries;
}

/**
 * What an archive holds, without unpacking it: the entry count and the bytes of file content.
 *
 * The summary exists for the bundler's own census line and for the test that compares two builds —
 * both want to know the archive describes the tree without paying for extraction twice.
 */
/**
 * @param {Buffer | Uint8Array} archive
 * @returns {{ entries: number, bytes: number }}
 */
export function tarSummary(archive) {
  const entries = untarEntries(archive);
  return {
    entries: entries.length,
    bytes: entries.reduce((total, entry) => total + entry.bytes.byteLength, 0),
  };
}
