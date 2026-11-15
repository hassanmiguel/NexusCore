const { BrowserWindow, app, shell } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    frame: false,
    backgroundColor: "#070204",
    icon: path.join(__dirname, "../../assets/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      devTools: !app.isPackaged
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.loadFile(path.join(__dirname, "../renderer/index.html"));
}

module.exports = { createWindow };