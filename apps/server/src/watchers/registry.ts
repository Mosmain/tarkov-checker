import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Reads a single string value from the Windows registry via `reg query`.
 * Returns null on non-Windows, on `reg` errors, or when the value is missing.
 * REG_EXPAND_SZ entries get their %VAR% references expanded against
 * process.env so callers always get an absolute path.
 */
async function readRegistryValue(keyPath: string, valueName: string): Promise<string | null> {
  if (process.platform !== "win32") return null;
  try {
    // chcp 65001 switches the cmd console to UTF-8 so paths containing
    // non-ASCII (e.g. Russian Documents folder) decode cleanly.
    const { stdout } = await execAsync(
      `chcp 65001 >NUL & reg query "${keyPath}" /v "${valueName}"`,
      { timeout: 5_000, windowsHide: true },
    );
    const lineRe = new RegExp(`\\s${valueName}\\s+REG_\\w+\\s+(.+)`);
    const match = stdout.match(lineRe);
    if (!match) return null;
    const raw = match[1]!.trim();
    return expandWinVars(raw);
  } catch {
    return null;
  }
}

function expandWinVars(value: string): string {
  return value.replace(/%([^%]+)%/g, (_, name: string) => process.env[name] ?? `%${name}%`);
}

/**
 * Windows "Documents" folder, honouring OneDrive / Documents redirection.
 * Reads HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders\Personal.
 */
export async function detectDocumentsDir(): Promise<string | null> {
  return readRegistryValue(
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders",
    "Personal",
  );
}

/**
 * Tarkov game install directory. BSG launcher writes this to the registry at
 * install time. Several keys have been used over the years; try them in order.
 */
export async function detectTarkovGameDir(): Promise<string | null> {
  const keys = [
    "HKLM\\SOFTWARE\\WOW6432Node\\Battlestate Games\\EFT",
    "HKLM\\SOFTWARE\\Battlestate Games\\EFT",
    "HKCU\\Software\\Battlestate Games\\EFT",
  ];
  for (const key of keys) {
    const value = await readRegistryValue(key, "InstallLocation");
    if (value) return value;
  }
  return null;
}
