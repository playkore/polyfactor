local M = {}

M.SIZE = 8

M.FIELD_WEIGHTS = {
  { 0, 0.38 },
  { 1, 0.40 },
  { 3, 0.15 },
  { 5, 0.055 },
  { 8, 0.015 },
}

M.PIECE_WEIGHTS = {
  { 0, 0.18 },
  { 1, 0.47 },
  { 3, 0.25 },
  { 5, 0.10 },
}

M.SHAPES = {
  { { 0, 0 }, { 1, 0 }, { 2, 0 }, { 3, 0 } },
  { { 0, 0 }, { 1, 0 }, { 0, 1 }, { 1, 1 } },
  { { 0, 0 }, { 1, 0 }, { 2, 0 }, { 1, 1 } },
  { { 0, 0 }, { 1, 0 }, { 1, 1 }, { 2, 1 } },
  { { 1, 0 }, { 2, 0 }, { 0, 1 }, { 1, 1 } },
  { { 0, 0 }, { 0, 1 }, { 1, 1 }, { 2, 1 } },
  { { 2, 0 }, { 0, 1 }, { 1, 1 }, { 2, 1 } },
}

local function coord(x, y)
  return { x, y }
end

local function clone_coord(cell)
  return coord(cell[1], cell[2])
end

function M.weighted_pick(items, rng)
  local random = rng or math.random
  local r = random()
  local acc = 0
  for i = 1, #items do
    local value = items[i][1]
    local weight = items[i][2]
    acc = acc + weight
    if r <= acc then
      return value
    end
  end
  return items[#items][1]
end

local function normalize_pairs(pairs)
  local min_x = pairs[1][1]
  local min_y = pairs[1][2]
  for i = 2, #pairs do
    local cell = pairs[i]
    if cell[1] < min_x then
      min_x = cell[1]
    end
    if cell[2] < min_y then
      min_y = cell[2]
    end
  end

  local normalized = {}
  for i = 1, #pairs do
    local cell = pairs[i]
    normalized[#normalized + 1] = { cell[1] - min_x, cell[2] - min_y, value = cell.value }
  end

  table.sort(normalized, function(a, b)
    if a[2] == b[2] then
      return a[1] < b[1]
    end
    return a[2] < b[2]
  end)

  return normalized
end

function M.normalize_cells(cells)
  local min_x = cells[1][1]
  local min_y = cells[1][2]
  for i = 2, #cells do
    local cell = cells[i]
    if cell[1] < min_x then
      min_x = cell[1]
    end
    if cell[2] < min_y then
      min_y = cell[2]
    end
  end

  local normalized = {}
  for i = 1, #cells do
    local cell = cells[i]
    normalized[#normalized + 1] = coord(cell[1] - min_x, cell[2] - min_y)
  end

  table.sort(normalized, function(a, b)
    if a[2] == b[2] then
      return a[1] < b[1]
    end
    return a[2] < b[2]
  end)

  return normalized
end

function M.rotate_piece_state(piece, anchor)
  local rotated = {}
  for i = 1, #piece.cells do
    local cell = piece.cells[i]
    rotated[#rotated + 1] = { cell[2], -cell[1], value = piece.values[i] or 0 }
  end

  local normalized = normalize_pairs(rotated)
  local rotated_anchor = nil

  if anchor then
    local min_x = rotated[1][1]
    local min_y = rotated[1][2]
    for i = 2, #rotated do
      local cell = rotated[i]
      if cell[1] < min_x then
        min_x = cell[1]
      end
      if cell[2] < min_y then
        min_y = cell[2]
      end
    end

    rotated_anchor = {
      col = anchor.row - min_x,
      row = -anchor.col - min_y,
    }
  end

  local cells = {}
  local values = {}
  for i = 1, #normalized do
    cells[i] = { normalized[i][1], normalized[i][2] }
    values[i] = normalized[i].value
  end

  return {
    cells = cells,
    values = values,
    anchor = rotated_anchor,
  }
end

function M.create_board(rng)
  local random = rng or math.random
  local board = {}
  for row = 1, M.SIZE do
    local out_row = {}
    for col = 1, M.SIZE do
      out_row[col] = {
        base = M.weighted_pick(M.FIELD_WEIGHTS, random),
        occupied = false,
        placed = nil,
      }
    end
    board[row] = out_row
  end
  return board
end

function M.create_piece(rng)
  local random = rng or math.random
  local shape_index = math.floor(random() * #M.SHAPES) + 1
  local shape = M.SHAPES[shape_index] or M.SHAPES[1]
  local cells = M.normalize_cells(shape)
  local values = {}
  for i = 1, 4 do
    values[i] = M.weighted_pick(M.PIECE_WEIGHTS, random)
  end
  return {
    cells = cells,
    values = values,
  }
end

function M.clone_board(board)
  local copy = {}
  for row = 1, #board do
    local source_row = board[row]
    local out_row = {}
    for col = 1, #source_row do
      local cell = source_row[col]
      out_row[col] = {
        base = cell.base,
        occupied = cell.occupied,
        placed = cell.placed,
      }
    end
    copy[row] = out_row
  end
  return copy
end

function M.clone_piece(piece)
  local cells = {}
  for i = 1, #piece.cells do
    cells[i] = clone_coord(piece.cells[i])
  end

  local values = {}
  for i = 1, #piece.values do
    values[i] = piece.values[i]
  end

  return {
    cells = cells,
    values = values,
  }
end

function M.can_place_at(board, cells, col, row)
  for i = 1, #cells do
    local cell = cells[i]
    local board_col = col + cell[1]
    local board_row = row + cell[2]
    if board_col < 0 or board_col >= M.SIZE or board_row < 0 or board_row >= M.SIZE then
      return false
    end
    if board[board_row + 1][board_col + 1].occupied then
      return false
    end
  end
  return true
end

function M.can_place_any_placement(board, piece)
  for row = 0, M.SIZE - 1 do
    for col = 0, M.SIZE - 1 do
      if M.can_place_at(board, piece.cells, col, row) then
        return true
      end
    end
  end
  return false
end

function M.compute_placement_total(board, piece, col, row)
  local total = 0
  for i = 1, #piece.cells do
    local cell = piece.cells[i]
    local board_col = col + cell[1]
    local board_row = row + cell[2]
    if board_col >= 0 and board_col < M.SIZE and board_row >= 0 and board_row < M.SIZE then
      local placed_cell = board[board_row + 1][board_col + 1]
      total = total + placed_cell.base * (piece.values[i] or 0)
    end
  end
  return total
end

function M.place_piece(board, piece, col, row)
  if not M.can_place_at(board, piece.cells, col, row) then
    return nil
  end

  local next_board = M.clone_board(board)
  local gained = 0
  local placed_cells = {}

  for i = 1, #piece.cells do
    local cell = piece.cells[i]
    local board_col = col + cell[1]
    local board_row = row + cell[2]
    local placed_value = piece.values[i] or 0
    local board_cell = next_board[board_row + 1][board_col + 1]
    board_cell.occupied = true
    board_cell.placed = placed_value
    gained = gained + placed_value * board_cell.base
    placed_cells[#placed_cells + 1] = {
      col = board_col,
      row = board_row,
      base = board_cell.base,
      placedValue = placed_value,
    }
  end

  return {
    board = next_board,
    gained = gained,
    placedCells = placed_cells,
  }
end

function M.clear_board(rng)
  return M.create_board(rng)
end

function M.create_initial_game(rng)
  return {
    board = M.create_board(rng),
    piece = M.create_piece(rng),
    score = 0,
    moves = 0,
  }
end

function M.collect_occupied_cells(board)
  local occupied = {}
  for row = 1, #board do
    for col = 1, #board[row] do
      local cell = board[row][col]
      if cell.occupied then
        occupied[#occupied + 1] = {
          col = col - 1,
          row = row - 1,
          base = cell.base,
          placedValue = cell.placed or 0,
        }
      end
    end
  end
  return occupied
end

return M
