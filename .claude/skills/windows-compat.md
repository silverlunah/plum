# Windows Compatibility Check

Scan every `.js` and `.mjs` file under `bin/`, `backend/config/scripts/`, `backend/scripts/`, and `backend/services/` (excluding `node_modules`) for patterns that break on Windows. For each finding report the file path, line number, the problematic line, and a one-sentence fix.

## Patterns to flag

### 1. `spawn` without `shell: true` for npm/npx/docker

```
spawn('npm', ...)   with no shell: true
spawn('npx', ...)   with no shell: true
spawn('docker', ...) with no shell: true
```

On Windows these are `.cmd` wrappers and cannot be found without a shell.
**Fix**: add `shell: true` to the options object.

### 2. `spawn('node', ...)` — hardcoded node binary

Using the string `'node'` may resolve to the wrong version or fail if Node is not in PATH as a plain binary.
**Fix**: use `process.execPath` instead.

### 3. Unix-only shell operators in `execSync`/`exec` strings

Strings passed to `execSync` or `exec` that contain `&&`, `||`, `$(...)`, backticks, or pipes (`|`). On `cmd.exe` some of these work, but compound `&&` chains are fragile and environment-specific.
**Fix**: split into separate `execSync` calls.

### 4. Unix-only binaries called via `execSync`/`exec`

Calls that invoke `chmod`, `chown`, `which`, `curl`, `wget`, `grep`, `sed`, `awk`, `rm -rf`, `cp -r`, or similar Unix binaries.
**Fix**: replace with Node.js `fs` equivalents or cross-platform npm packages.

### 5. Hardcoded `/` path separators

String literals that build file paths by concatenation with `/` instead of `path.join()` or `path.resolve()`.
**Fix**: use `path.join()`.

### 6. Path written into YAML/config without backslash normalisation

An absolute path obtained via `path.resolve()` or similar that is embedded into a YAML string without `.replace(/\\/g, '/')`. On Windows `path.resolve()` returns backslashes, which break YAML volume mounts.
**Fix**: call `.replace(/\\/g, '/')` before embedding into the YAML string.

## How to run this check

Use `grep` and `Read` to locate each pattern across the target directories. Report findings as a table:

| File | Line | Pattern | Fix |
| ---- | ---- | ------- | --- |

If no issues are found, say so clearly.
