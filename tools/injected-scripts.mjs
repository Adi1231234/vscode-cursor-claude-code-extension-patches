/* The ordered fragment lists tools/check-injected.mjs checks, mirroring what
 * each patch.ps1 concatenates. A patch whose script is a single file needs no
 * entry. Every path is resolved against the repo root, so the check gives the
 * same answer from whatever directory it is run in.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

export const SCRIPTS = {
  "prompt-queue": {
    /* Read, not repeated. Kept here as well as in patch.ps1, this list went
       stale the moment saved/ landed: "ok (18 fragments)" for a bundle that
       ships 27, six files never scanned. Repo-root paths - the assembly
       reaches outside the patch folder. */
    files: JSON.parse(read("patches/prompt-queue/order.json"))
  },
  "shared-lib": {
    dir: "lib/js/",
    /* Every file in lib/js, read off the folder rather than written down: a
       list here named ccWtResolve for months after the file was retired, and
       never named ccModal at all. */
    order: fs.readdirSync(path.join(root, "lib/js"))
      .filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)).sort(),
    /* Each of these is its own file, injected into somebody else's script -
       concatenating them is not a program, so only the escape scan applies.
       They were not scanned at all before, and ccRow.js shipped a swallowed
       backslash because of it. */
    escapesOnly: true
  },
  "auto-followup": {
    dir: "patches/auto-followup/af/",
    /* Read, not repeated. This list lived in five places; once.js was added to
       four of them and this one kept scanning a bundle the patch no longer ships. */
    order: JSON.parse(read("patches/auto-followup/af/order.json"))
  }
};
