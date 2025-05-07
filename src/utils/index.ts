import { window } from "../main";
import { IpcMethod, Notification, NotificationType } from "../types";
import { BrowserWindow } from "electron";

export const sendSuccessNotification = (message: string) => {
  sendNotification({
    type: NotificationType.Success,
    message,
    timestampMs: Date.now(),
  });
};

export const sendErrorNotification = (message: string) => {
  sendNotification({
    type: NotificationType.Error,
    message,
    timestampMs: Date.now(),
  });
};

export const sendInfoNotification = (message: string) => {
  sendNotification({
    type: NotificationType.Info,
    message,
    timestampMs: Date.now(),
  });
};

async function sendNotification(notification: Notification) {
	window?.webContents.send(IpcMethod.Notification, notification);
  }