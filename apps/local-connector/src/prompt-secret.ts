import { stdin, stdout } from "node:process";

export async function promptLine(label: string): Promise<string> {
  stdout.write(label);
  return await new Promise<string>((resolve, reject) => {
    let value = "";
    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        if (byte === 3) {
          cleanup();
          reject(new Error("Input cancelled."));
          return;
        }
        if (byte === 10 || byte === 13) {
          cleanup();
          stdout.write("\n");
          resolve(value.trim());
          return;
        }
        value += String.fromCharCode(byte);
      }
    };
    const cleanup = (): void => {
      stdin.off("data", onData);
      stdin.pause();
    };
    stdin.on("data", onData);
    stdin.resume();
  });
}

export async function promptSecret(label: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("A TTY is required for secure secret entry.");
  }
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  return await new Promise<string>((resolve, reject) => {
    let value = "";
    const cleanup = (): void => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        if (byte === 3) {
          cleanup();
          reject(new Error("Input cancelled."));
          return;
        }
        if (byte === 10 || byte === 13) {
          cleanup();
          resolve(value);
          return;
        }
        if (byte === 8 || byte === 127) {
          value = value.slice(0, -1);
          continue;
        }
        if (byte >= 32) value += String.fromCharCode(byte);
      }
    };
    stdin.on("data", onData);
  });
}
