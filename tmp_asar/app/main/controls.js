const { ipcMain, BrowserWindow, clipboard, shell } = require("electron");
const { execute } = require("../../core/tools");

ipcMain.on("win:min", e => {
  BrowserWindow.fromWebContents(e.sender).minimize();
});

ipcMain.on("win:max", e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.on("win:close", e => {
  BrowserWindow.fromWebContents(e.sender).close();
});

ipcMain.on("clipboard:copy", (e, text) => {
  clipboard.writeText(String(text || ""));
});

ipcMain.on("system:open-path", (e, path) => {
  shell.openPath(path);
});

ipcMain.handle("system:execute-tool", async (e, { toolName, args, confirmed }) => {
  const result = await execute(toolName, args, { confirmed });
  return result;
});
