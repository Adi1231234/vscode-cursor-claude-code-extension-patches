// Builds the sandbox test copy: the shipped payloads plus the probe, injected
// into a copy of app.asar under <out>\resources, and the launch aid beside it.
// Never part of what ships: apply.ps1 builds without any of this.
//   node build-sandbox.cjs <pristine app.asar> <out dir> <version.dll>
const fs = require("fs"), path = require("path"), cp = require("child_process");
const [asar, out, dll] = process.argv.slice(2);
const tools = path.join(__dirname, "..");
const tmp = path.join(out, "_payload");
const read = f => fs.readFileSync(f, "utf8");

cp.execFileSync(process.execPath, [path.join(tools, "build.cjs"), asar, tmp], { stdio: "inherit" });

/* The probe goes inside the payload's own guard (lib/js/guard-close.js ends
   it), so it runs only in the claude.ai page, as the payload does. */
const guardClose = read(path.join(tools, "..", "lib", "js", "guard-close.js")).trim();
const probe = ["probe-renderer.js", "probe-actions.js"].map(f => read(path.join(__dirname, f))).join("\n;\n");
const rjs = read(path.join(tmp, "renderer.js"));
const cut = rjs.lastIndexOf(guardClose);
if (cut < 0) throw new Error("the renderer payload has no guard to put the probe inside");
fs.writeFileSync(path.join(tmp, "renderer.js"), rjs.slice(0, cut) + "\n;\n" + probe + "\n;\n" + rjs.slice(cut));
fs.appendFileSync(path.join(tmp, "main.js"), "\n;\n" + read(path.join(__dirname, "probe-main.js")));

fs.mkdirSync(path.join(out, "resources"), { recursive: true });
const target = path.join(out, "resources", "app.asar");
fs.copyFileSync(asar, target);
cp.execFileSync(process.execPath, [path.join(tools, "inject-cli.cjs"), target, path.join(tmp, "renderer.js"), path.join(tmp, "main.js"), "CCDESK"], { stdio: "inherit" });
fs.rmSync(target + ".ccorig", { force: true });
fs.copyFileSync(dll, path.join(out, "version.dll"));
fs.rmSync(tmp, { recursive: true, force: true });
console.log("sandbox copy ready in " + out);
