import { spawn } from "node:child_process";

/**
 * Starts and stops the local POHODA mServer via `Pohoda.exe /HTTP <cmd> "<config>"`.
 * Windows-only: mServer ships inside POHODA, which is a Windows application.
 */
export class MServerController {
  constructor(
    private readonly exePath: string,
    private readonly configName: string,
  ) {}

  /** Launches the mServer and polls `probe` once per second until it answers or the timeout elapses. */
  async start(probe: () => Promise<unknown>, timeoutSeconds = 30): Promise<void> {
    this.run("start");
    for (let i = 0; i < timeoutSeconds; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        await probe();
        return;
      } catch {
        // not up yet
      }
    }
    throw new Error(`mServer '${this.configName}' did not start within ${timeoutSeconds} seconds.`);
  }

  /** Sends the stop command without waiting for the process to exit. */
  stop(): void {
    this.run("stop");
  }

  private run(command: "start" | "stop"): void {
    const child = spawn(this.exePath, ["/HTTP", command, this.configName], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => {});
    child.unref();
  }
}
