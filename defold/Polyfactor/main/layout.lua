local M = {}

M.SCREEN_WIDTH = 640
M.SCREEN_HEIGHT = 1136

M.BG = {
  color = { 0.0627, 0.0784, 0.0706, 1.0 },
}

M.PANEL = {
  color = { 0.9333, 0.9098, 0.8157, 1.0 },
  ink = { 0.0627, 0.0784, 0.0706, 1.0 },
  muted = { 0.4353, 0.4157, 0.3569, 1.0 },
  line = { 0.0627, 0.0784, 0.0706, 1.0 },
}

M.VALUE_STYLES = {
  [0] = { bg = "#ddd4b8", fg = "#918a76" },
  [1] = { bg = "#e8f1fb", fg = "#255c9b" },
  [3] = { bg = "#e8f6ef", fg = "#2e7d57" },
  [5] = { bg = "#fff1d9", fg = "#9b5b1f" },
  [8] = { bg = "#f6e3e0", fg = "#9a3f3a" },
}

M.BOARD = {
  size = 336,
  cell = 42,
  left = -168,
  top = 500,
  panel_pad = 10,
}

M.TITLE = {
  pos = { 0, 252 },
}

M.NEW_GAME = {
  pos = { 0, 198 },
  size = { 180, 44 },
}

M.STATS = {
  left = -220,
  right = 220,
  y = 154,
}

M.PREVIEW_PANEL = {
  pos = { -150, 48 },
  size = { 210, 170 },
}

M.STORE_PANEL = {
  pos = { 150, 48 },
  size = { 210, 170 },
}

M.TOOLTIP = {
  size = { 200, 30 },
}

M.OVERLAY = {
  size = { 640, 1136 },
}

M.BOARD_SHAKE = {
  max = 14,
  soft = 6,
}

return M
