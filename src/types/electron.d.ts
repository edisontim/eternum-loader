import {
  IpcMethod,
  Notification,
  ProgressUpdatePayload,
  ToriiConfig,
} from "../types";

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export interface ElectronAPI {
  sendMessage: (channel: IpcMethod, data?: unknown) => void;
  invoke: <T>(channel: IpcMethod, data?: unknown) => Promise<T>;
  on: (
    channel: IpcMethod,
    func: (event: Electron.IpcRendererEvent, ...args: any[]) => void,
  ) => () => void;
  onNotification: (
    callback: (notification: Notification) => void,
  ) => () => void;
  onConfigChanged: (callback: (config: ToriiConfig) => void) => () => void;
  onProgressUpdate: (
    callback: (payload: ProgressUpdatePayload) => void,
  ) => () => void;
}
