/* Every .ps1 in the repo, handed to PowerShell's own parser.
 *
 *   node tools/check-ps1.mjs
 *
 * The suite was JavaScript only, and the patcher is PowerShell - so a guard added
 * to lib/Patch.ps1 shipped with its quotes stripped, every .ps1 failed to load,
 * and `apply.ps1` could not run at all. Nothing in the repository noticed: the
 * unit suites were green, check-injected was green, and the patcher was dead.
 *
 * Parsing is not running. This says the files load, which is the failure that
 * actually happened; it says nothing about whether a patch does its job.
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ps = `
$ErrorActionPreference = 'Stop'
$root = '${root.replace(/'/g, "''")}'
$bad = 0
Get-ChildItem -LiteralPath '${root.replace(/'/g, "''")}' -Recurse -Filter *.ps1 |
  Where-Object { $_.FullName -notlike '*node_modules*' -and $_.FullName -notlike (Join-Path $root '.git*') -and $_.FullName -notlike (Join-Path $root '.claude-wt*') -and $_.FullName -notlike (Join-Path $root '.claude\worktrees*') } |
  ForEach-Object {
    $e = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$null, [ref]$e)
    if ($e -and $e.Count) {
      $bad++
      Write-Output ("  BROKEN " + $_.FullName + " : " + $e[0].Message)
    } else { $script:seen++ }
  }
Write-Output ("ok - $script:seen file(s) parsed, $bad broken")
if ($bad) { exit 1 }
`;

try {
  const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps],
                           { encoding: 'utf8', cwd: root });
  process.stdout.write(out.trim() + '\n');
} catch (e) {
  process.stdout.write(((e.stdout || '') + (e.stderr || '')).trim() + '\n');
  process.exit(1);
}
