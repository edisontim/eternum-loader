import { ChildProcessWithoutNullStreams } from "child_process";
import * as spawn from "cross-spawn";
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  Tray,
} from "electron";
import started from "electron-squirrel-startup";
import * as fs from "fs";
import { mkdirSync } from "fs";
import * as fsPromises from "fs/promises";
import hasbin from "hasbin";
import path from "path";
import { RpcProvider } from "starknet";
import { updateElectronApp } from "update-electron-app";
import packageJson from "../package.json";
import { APP_PATH, DOJO_PATH } from "./constants";
import { Page } from "./frontend/context";
import {
  ConfigType,
  IpcMethod,
  ProgressUpdatePayload,
  ToriiConfig,
} from "./types";
import { sendErrorNotification, sendInfoNotification } from "./utils";
import { loadConfig, saveConfigType } from "./utils/config";
import {
  errorLog,
  getDbPath,
  getStateFilePath,
  getToriiTomlConfigPath,
  normalLog,
  osUtils,
  warningLog,
} from "./utils/os-utils";
import { getToriiVersion } from "./utils/torii";

// Declare Vite environment variables
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let child: ChildProcessWithoutNullStreams | null = null;
export let config: ToriiConfig | null = null;

export let window: BrowserWindow | null = null;

let tray: Tray | null = null;

let initialToriiBlock: number | null = null;
let currentToriiBlock: number = 0;
let currentChainBlock: number = 0;

let toriiVersion: string | null = null;

let progressInterval: NodeJS.Timeout | null = null;

let page = Page.Start;

const SYNC_INTERVAL = 4000;

if (started) {
  app.quit();
}

if (app.dock && process.platform === "darwin") {
  app.dock.setIcon(path.join(__dirname, "macos-icon.png"));
}

updateElectronApp();

app.whenReady().then(() => {
  try {
    if (process.platform === "darwin") {
      tray = new Tray(path.join(__dirname, "tray-icon@2x.png"));
    } else {
      tray = new Tray(path.join(__dirname, "tray-icon.png"));
    }

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Open",
        type: "normal",
        click: async () => {
          if (window && !window.isDestroyed()) {
            window.show();
            window.focus();
          } else {
            createWindow();
          }
        },
      },
      { label: "Quit", type: "normal", click: () => app.quit() },
    ]);
    tray.setToolTip("Eternum Loader");
    tray.setContextMenu(contextMenu);
  } catch (error) {
    sendErrorNotification(`Failed to create tray: ${error}`);
  }
});

const createWindow = () => {
  try {
    if (window && !window.isDestroyed()) {
      window.focus();
      return window;
    }

    window = new BrowserWindow({
      width: 842,
      height: 585,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        nodeIntegration: true,
        contextIsolation: true,
        partition: "persist:eternum-loader",
        devTools: !app.isPackaged,
      },
      resizable: false,
      center: true,
      title: "Eternum Loader",
      frame: false,
    });

    window.on("close", () => {
      window = null;
    });

    window.on("ready-to-show", async () => {
      try {
        window?.webContents.send(IpcMethod.PageNotification, page);
        window?.webContents.send(IpcMethod.ConfigWasChanged, config);
        window?.webContents.send(
          IpcMethod.VersionNotification,
          packageJson.version
        );
        window.webContents.send(IpcMethod.ProgressUpdate, {
          progress: calculateProgress(),
          initialToriiBlock,
          currentToriiBlock,
          currentChainBlock,
        });
      } catch (error) {
        sendErrorNotification("Failed to send window ready event: " + error);
      }
    });

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      window.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
      );
    }
    return window;
  } catch (error) {
    sendErrorNotification("Failed to create window: " + error);
  }
};

const runApp = async () => {
  try {
    toriiVersion = await getToriiVersion();
    config = await loadConfig();
  } catch (error) {
    sendErrorNotification("Failed to run app: " + error);
  }
};

app.on("before-quit", () => {
  try {
    killTorii();
  } catch (error) {
    sendErrorNotification("Failed to kill Torii: " + error);
  }
});

app.on("ready", () => {
  try {
    createWindow();

    runApp();
  } catch (error) {
    sendErrorNotification("Failed to run app: " + error);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  try {
    createWindow();
  } catch (error) {
    sendErrorNotification("Failed to create window: " + error);
  }
});

ipcMain.on(IpcMethod.StartTorii, async (event, arg) => {
  try {
    if (child) {
      sendErrorNotification("Torii is already running");
      return;
    }

    await saveConfigType(arg);
    config = await loadConfig();
    initialToriiBlock = await readFirstBlock();

    sendInfoNotification(`Starting Torii (${toriiVersion})`);
    window?.webContents.send(IpcMethod.ConfigWasChanged, config);
    page = Page.Syncing;
    handleTorii(toriiVersion);
  } catch (e) {
    sendErrorNotification("Failed to start Torii: " + e);
  }
});

ipcMain.on(IpcMethod.KillTorii, (event, arg) => {
  try {
    killTorii();
    sendInfoNotification("Torii successfully killed");
  } catch (e) {
    sendErrorNotification("Failed to kill Torii: " + e);
  }
});

ipcMain.on(IpcMethod.ResetDatabase, async (event, arg) => {
  try {
    killTorii();

    await timeout(2000);

    await osUtils.removeDirectory(getDbPath(config.configType));
    await resetFirstBlock(null, true);
    initialToriiBlock = null;

    currentChainBlock = 0;
    currentToriiBlock = 0;
    sendInfoNotification("Database successfully reset");
  } catch (e) {
    sendErrorNotification("Failed to reset database: " + e);
  }
});

ipcMain.on(IpcMethod.ChangeConfigType, async (event, arg: ConfigType) => {
  try {
    console.log("Changing configuration to", arg);

    normalLog("Waiting 2 seconds for ports to release after killing Torii...");
    await timeout(2000);

    await saveConfigType(arg);
    config = await loadConfig();
    initialToriiBlock = await readFirstBlock();

    killTorii();

    window?.webContents.send(IpcMethod.ConfigWasChanged, config);
    sendInfoNotification("Config type successfully changed");
  } catch (e) {
    sendErrorNotification("Failed to change config type: " + e);
  }
});

async function handleTorii(toriiVersion: string) {
  let toriiPath: string;

  try {
    const toriiExecutable = osUtils.getExecutableName("torii");
    toriiPath = path.join(DOJO_PATH, "bin", toriiExecutable);

    const hasTorii = hasbin.sync(toriiExecutable) || fs.existsSync(toriiPath);

    if (!hasTorii) {
      sendInfoNotification(
        "Torii executable not found, installing to version " + toriiVersion
      );
      await installTorii(toriiPath, toriiVersion);
      sendInfoNotification("Torii installed on version " + toriiVersion);

      if (!fs.existsSync(toriiPath)) {
        throw new Error(
          `Torii executable not found at expected path: ${toriiPath}`
        );
      }
    } else {
      const versionArgs = ["--version"];
      const versionResult = spawn.sync(toriiPath, versionArgs);
      const currentVersion = `v${versionResult.stdout.toString().replace(/torii/g, "").replace(/\s+/g, "")}`;

      if (currentVersion !== toriiVersion) {
        normalLog(`Updating torii from ${currentVersion} to ${toriiVersion}`);
        await installTorii(toriiPath, toriiVersion);
        sendInfoNotification("Torii updated to version " + toriiVersion);
      }
    }
  } catch (error) {
    errorLog(`Failed to install Torii: ${error.message}`);
    sendErrorNotification(`Failed to install Torii: ${error.message}`);

    await timeout(10000);
    return handleTorii(toriiVersion);
  }

  while (true) {
    try {
      const toriiTomlPath = getToriiTomlConfigPath(config.configType);

      const dbPath = getDbPath(config.configType);
      mkdirSync(dbPath, { recursive: true });

      normalLog(
        `Launching torii with params:\n- network ${config.configType}\n- rpc ${config.rpc}\n- world address ${config.world_address}\n- db ${dbPath}\n- config ${toriiTomlPath}`
      );

      startSyncLoop();

      if (!fs.existsSync(toriiPath)) {
        throw new Error(`Torii executable not found at: ${toriiPath}`);
      }
      if (!fs.existsSync(toriiTomlPath)) {
        throw new Error(`Config file not found at: ${toriiTomlPath}`);
      }
      if (!fs.existsSync(dbPath)) {
        throw new Error(`Database directory not found at: ${dbPath}`);
      }

      child = spawn.spawn(
        toriiPath,
        ["--config", toriiTomlPath, "--db-dir", dbPath],
        {
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        }
      );

      child.stdout.on("data", (data: Buffer) => {
        normalLog(`Torii stdout: ${data.toString()}`);
      });

      child.stderr.on("data", (data: Buffer) => {
        const message = data.toString();
        if (
          message.toLowerCase().includes("error") ||
          message.toLowerCase().includes("failed")
        ) {
          errorLog(`Torii stderr: ${message}`);
          sendErrorNotification(message);
        } else {
          normalLog(`Torii stderr: ${message}`);
        }
      });

      let firstPass = true;

      await new Promise<void>((resolve) => {
        child?.on("exit", (code, signal) => {
          errorLog(
            `Torii process exited with code ${code} and signal ${signal}`
          );
          resolve();
        });
        child?.on("error", (err) => {
          errorLog(`Torii process error: ${err}`);
          resolve();
        });
      });

      if (child) {
        if (firstPass) {
          normalLog("Torii is running");
          sendInfoNotification("Torii on " + config.configType);
          firstPass = false;
        }

        const exitCode = child.exitCode;
        child.removeAllListeners();

        if (exitCode !== 0 && exitCode !== 137) {
          errorLog(`Torii exited with code ${exitCode}`);
          sendErrorNotification(
            `Torii exited with code ${exitCode}. Check console for details.`
          );
        }
      }

      warningLog("Torii exited, waiting for 5s for ports to be released");
      await timeout(5000);
    } catch (error) {
      errorLog(`Error in handleTorii: ${error}`);
      sendErrorNotification(`Torii error: ${error}`);
      await timeout(3000);
    } finally {
      stopSyncLoop();
    }
  }
}

function timeout(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function installTorii(toriiPath: string, toriiVersion: string) {
  if (osUtils.isWindows()) {
    normalLog("Installing Torii on Windows...");

    const tempDir = path.join(APP_PATH, "torii-temp");
    await fsPromises.mkdir(tempDir, { recursive: true });
    const zipPath = path.join(tempDir, "dojo.zip");

    const downloadUrl = `https://github.com/dojoengine/dojo/releases/download/${toriiVersion}/dojo_${toriiVersion}_win32_amd64.zip`;
    const result = spawn.sync("powershell", [
      "-c",
      `Invoke-WebRequest -Uri "${downloadUrl}" -OutFile "${zipPath}"`,
    ]);

    if (result.status !== 0) {
      const errorMsg = result.stderr
        ? result.stderr.toString()
        : "Unknown error";
      errorLog(`Windows download failed: ${errorMsg}`);
      throw new Error(
        `Download failed with code ${result.status}: ${errorMsg}`
      );
    }

    await fsPromises.mkdir(path.join(DOJO_PATH, "bin"), { recursive: true });

    const extractResult = spawn.sync("powershell", [
      "-c",
      `Expand-Archive -Path "${zipPath}" -DestinationPath "${tempDir}" -Force; ` +
        `Copy-Item -Path "${path.join(tempDir, "torii.exe")}" -Destination "${toriiPath}" -Force`,
    ]);

    if (extractResult.status !== 0) {
      const errorMsg = extractResult.stderr
        ? extractResult.stderr.toString()
        : "Unknown error";
      errorLog(`Windows extraction failed: ${errorMsg}`);
      throw new Error(
        `Extraction failed with code ${extractResult.status}: ${errorMsg}`
      );
    }

    await fsPromises.rm(tempDir, { recursive: true, force: true });
  } else {
    normalLog("Installing Torii on Unix-based system...");
    const dojoupExecutable = osUtils.getExecutableName("dojoup");
    const dojoupPath = path.join(DOJO_PATH, "dojoup", dojoupExecutable);

    const result = spawn.sync("sh", [
      "-c",
      `curl -L https://install.dojoengine.org | bash && ${dojoupPath} component add torii ${toriiVersion}`,
    ]);

    if (result.status !== 0) {
      const errorMsg = result.stderr
        ? result.stderr.toString()
        : "Unknown error";
      errorLog(`Unix installation failed: ${errorMsg}`);
      throw new Error(
        `Unix installation failed with code ${result.status}: ${errorMsg}`
      );
    }
  }

  normalLog("Torii installation completed successfully");
  sendInfoNotification(`Torii ${toriiVersion} installed successfully`);
}

function killTorii() {
  warningLog("Killing all torii processes");
  try {
    if (osUtils.isWindows()) {
      try {
        spawn.sync("taskkill", ["/f", "/im", "torii.exe"]);
      } catch (e) {
        // Ignore errors if no processes found
      }
    } else {
      try {
        spawn.sync("pkill", ["-9", "torii"]);
      } catch (e) {
        try {
          spawn.sync("killall", ["-9", "torii"]);
        } catch (e) {
          // Ignore errors if no processes found
        }
      }
    }
  } catch (error) {
    errorLog(`Error killing Torii processes: ${error}`);
    sendErrorNotification(`Failed to kill Torii processes: ${error}`);
  } finally {
    child = null;
    warningLog("Torii processes killed");
  }
}

async function resetFirstBlock(
  firstBlock: number | null,
  force: boolean = false
) {
  const stateFilePath = getStateFilePath(config.configType);
  const state = await fsPromises.readFile(stateFilePath, "utf8");
  const stateJson = JSON.parse(state);
  if (force || !stateJson.firstBlock) {
    stateJson.firstBlock = firstBlock;
    fs.writeFileSync(
      getStateFilePath(config.configType),
      JSON.stringify(stateJson)
    );
  }
  initialToriiBlock = firstBlock;
}

async function readFirstBlock() {
  const stateFilePath = getStateFilePath(config.configType);
  const exists = await osUtils.fileExists(stateFilePath);

  if (!exists) {
    warningLog("State file does not exist, creating...");
    await fsPromises.writeFile(
      stateFilePath,
      JSON.stringify({ firstBlock: null })
    );
  }

  const state = await fsPromises.readFile(stateFilePath, {
    encoding: "utf8",
    flag: "r",
  });
  const stateJson = JSON.parse(state);
  initialToriiBlock = stateJson.firstBlock;
  return stateJson.firstBlock;
}

const getChainCurrentBlock = async (
  currentConfig: ToriiConfig
): Promise<number> => {
  if (!currentConfig?.rpc) {
    warningLog("RPC config not available for fetching chain block.");
    return 0;
  }
  try {
    const provider = new RpcProvider({
      nodeUrl: currentConfig.rpc,
    });
    const block = await provider.getBlockNumber();
    console.log("chain block", block);
    return block;
  } catch (error) {
    errorLog(`Error fetching chain current block: ${error}`);
    sendErrorNotification(
      `Failed to get chain block: ${error.message || error}`
    );
    return 0;
  }
};

const getToriiCurrentBlock = async (): Promise<number> => {
  const sqlQuery = "SELECT MAX(head) FROM contracts;";
  const url = new URL("sql", "http://localhost:8080");
  url.searchParams.set("query", sqlQuery);

  const response = await fetch(url, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  console.log("torii current block", data);
  if (
    !data ||
    data.length === 0 ||
    typeof data[0]?.["MAX(head)"] !== "number"
  ) {
    throw new Error("Invalid response format from Torii SQL endpoint");
  }
  return data[0]["MAX(head)"];
};

async function syncAndSendProgress() {
  if (!config || !window) return;

  try {
    const fetchedChainBlock = await getChainCurrentBlock(config);
    const fetchedToriiBlock = await getToriiCurrentBlock();

    currentChainBlock = fetchedChainBlock;
    currentToriiBlock = fetchedToriiBlock;

    if (initialToriiBlock === null) {
      const storedFirstBlock = await readFirstBlock();
      if (storedFirstBlock !== null) {
        initialToriiBlock = storedFirstBlock;
      } else if (currentToriiBlock > 0) {
        normalLog(`Setting initial Torii block to ${currentToriiBlock}`);
        initialToriiBlock = currentToriiBlock;
        await resetFirstBlock(initialToriiBlock, true);
      }
    }

    const payload: ProgressUpdatePayload = {
      progress: calculateProgress(),
      initialToriiBlock,
      currentToriiBlock,
      currentChainBlock,
    };
    setTrayProgress(payload.progress);
    if (window) {
      window.webContents.send(IpcMethod.ProgressUpdate, payload);
    }
  } catch (error) {
    errorLog(`Error during sync/progress update: ${error}`);
    sendErrorNotification(`Error during sync/progress update: ${error}`);
  }
}

const calculateProgress = () => {
  let progress = 0;
  if (
    initialToriiBlock !== null &&
    currentChainBlock > 0 &&
    currentChainBlock > initialToriiBlock
  ) {
    progress =
      (currentToriiBlock - initialToriiBlock) /
      (currentChainBlock - initialToriiBlock);
    progress = Math.min(Math.max(progress, 0), 1);
  } else if (
    initialToriiBlock !== null &&
    currentToriiBlock >= initialToriiBlock
  ) {
    progress = 1;
  }
  console.log("progress", progress);
  return Math.floor(progress * 100);
};

function startSyncLoop() {
  if (progressInterval) {
    clearInterval(progressInterval);
  }
  progressInterval = setInterval(syncAndSendProgress, SYNC_INTERVAL);
}

function stopSyncLoop() {
  if (progressInterval) {
    normalLog("Stopping progress sync loop");
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

const setTrayProgress = (progress: number) => {
  if (tray) {
    tray.setTitle(`${progress.toString() ?? "0"}%`);
  }
};

app.on("browser-window-focus", function () {
  try {
    globalShortcut.register("CommandOrControl+R", () => {
      console.log("CommandOrControl+R is pressed: Shortcut Disabled");
    });
    globalShortcut.register("CommandOrControl+Shift+R", () => {
      console.log("CommandOrControl+Shift+R is pressed: Shortcut Disabled");
    });
    globalShortcut.register("F5", () => {
      console.log("F5 is pressed: Shortcut Disabled");
    });
  } catch (error) {
    sendErrorNotification("Failed to register shortcuts: " + error);
  }
});

app.on("browser-window-blur", function () {
  try {
    globalShortcut.unregister("CommandOrControl+R");
    globalShortcut.unregister("CommandOrControl+Shift+R");
    globalShortcut.unregister("F5");
  } catch (error) {
    sendErrorNotification("Failed to unregister shortcuts: " + error);
  }
});
