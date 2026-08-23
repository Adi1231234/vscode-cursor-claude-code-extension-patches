/* Argument parsing and the help text - the one part of the lab an agent reads
   before anything else, so it has to be exact.

   `--version` and `--port` take a value, and that value must not then be
   mistaken for a positional argument: `eval --port 9555 probe.js` has to run
   `probe.js`, not `9555`. Naive filtering of everything that does not start
   with `--` gets that wrong, silently, and reads the port as a script. */

const VALUED = new Set(['version', 'port']);

export function parse(argv) {
    const flags = {};
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--')) { positional.push(arg); continue; }
        const [name, inline] = arg.slice(2).split('=');
        if (!VALUED.has(name)) flags[name] = true;
        else flags[name] = inline !== undefined ? inline : argv[++i];
    }
    return { cmd: positional[0], args: positional.slice(1), flags };
}

const HELP = `tools/lab - a patched Claude Code bundle, running in a real editor

  node tools/lab/lab.mjs up                 pristine VSIX -> apply.ps1 -> editor -> panel open
  node tools/lab/lab.mjs eval <script.js>   run one expression inside that panel
  node tools/lab/lab.mjs repatch            pristine again -> apply.ps1 -> real window reload
  node tools/lab/lab.mjs down [--purge]     stop it (--purge also deletes the lab profile)

  --version <x.y.z>   which extension version to test (default: the newest one installed here)
  --port <n>          CDP port for this lab (default 9555; use another for a second lab)

The loop is: edit a patch, "repatch", "eval". The editor stays up in between,
and none of it touches your own editor, profile or argv.json.

The eval script is ONE expression, evaluated inside the panel - "document" is
the panel's document. Wrap anything longer in (async () => { ... })(). What it
returns is printed as JSON.

Needs: Windows, VS Code installed, Node 22+. First run downloads ~110MB once
per version. Full notes, and the silent failures this exists to avoid, are in
tools/lab/README.md.`;

export function usage(code) {
    console.error(HELP);
    process.exit(code);
}
