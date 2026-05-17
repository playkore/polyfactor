export const BOARD_SIZES = [4, 6, 8] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];
export const DEFAULT_BOARD_SIZE: BoardSize = 8;
export const SIZE = DEFAULT_BOARD_SIZE;

export type CellBase = 0 | 1 | 3 | 5 | 8;
export type CellCoord = readonly [number, number];

export interface BoardCell {
  base: CellBase;
  occupied: boolean;
  placed: number | null;
}

export type GameBoard = BoardCell[][];

export interface PieceState {
  cells: CellCoord[];
  values: number[];
}

export interface RotatedPieceState {
  cells: CellCoord[];
  values: number[];
  anchor: { col: number; row: number } | null;
}

export interface PlacedCell {
  col: number;
  row: number;
  base: CellBase;
  placedValue: number;
}

export interface SavedGameStateV1 {
  version: 1;
  boardSize: BoardSize;
  board: GameBoard;
  piece: PieceState;
  score: number;
  moves: number;
  gameOver: boolean;
}

export const FIELD_WEIGHTS: ReadonlyArray<readonly [CellBase, number]> = [
  [0, 0.38],
  [1, 0.4],
  [3, 0.15],
  [5, 0.055],
  [8, 0.015],
];

export const PIECE_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0.18],
  [1, 0.47],
  [3, 0.25],
  [5, 0.1],
];

export const SHAPES: ReadonlyArray<readonly CellCoord[]> = [
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[2, 0], [0, 1], [1, 1], [2, 1]],
];

export const VALUE_STYLES: Record<CellBase, { bg: string; fg: string }> = {
  0: { bg: '#ddd4b8', fg: '#918a76' },
  1: { bg: '#e8f1fb', fg: '#255c9b' },
  3: { bg: '#e8f6ef', fg: '#2e7d57' },
  5: { bg: '#fff1d9', fg: '#9b5b1f' },
  8: { bg: '#f6e3e0', fg: '#9a3f3a' },
};

export function weightedPick<T>(items: ReadonlyArray<readonly [T, number]>, rng: () => number = Math.random): T {
  const r = rng();
  let acc = 0;
  for (const [value, weight] of items) {
    acc += weight;
    if (r <= acc) return value;
  }
  return items[items.length - 1]?.[0] as T;
}

export function normalizeCells(cells: CellCoord[]): CellCoord[] {
  const minX = Math.min(...cells.map(cell => cell[0]));
  const minY = Math.min(...cells.map(cell => cell[1]));
  return cells
    .map(([x, y]) => [x - minX, y - minY] as CellCoord)
    .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
}

function normalizePairs(pairs: ReadonlyArray<{ cell: CellCoord; value: number }>) {
  const minX = Math.min(...pairs.map(pair => pair.cell[0]));
  const minY = Math.min(...pairs.map(pair => pair.cell[1]));
  return pairs
    .map(({ cell, value }) => ({
      cell: [cell[0] - minX, cell[1] - minY] as CellCoord,
      value,
    }))
    .sort((a, b) => (a.cell[1] - b.cell[1]) || (a.cell[0] - b.cell[0]));
}

export function rotatePieceState(piece: PieceState, anchor: { col: number; row: number } | null = null): RotatedPieceState {
  const rotated = piece.cells.map((cell, index) => ({
    cell: [cell[1], -cell[0]] as CellCoord,
    value: piece.values[index] ?? 0,
  }));
  const normalized = normalizePairs(rotated);

  let rotatedAnchor: RotatedPieceState['anchor'] = null;
  if (anchor) {
    const anchorRotated = { cell: [anchor.row, -anchor.col] as CellCoord, value: 0 };
    const minX = Math.min(...rotated.map(pair => pair.cell[0]));
    const minY = Math.min(...rotated.map(pair => pair.cell[1]));
    rotatedAnchor = {
      col: anchorRotated.cell[0] - minX,
      row: anchorRotated.cell[1] - minY,
    };
  }

  return {
    cells: normalized.map(pair => pair.cell),
    values: normalized.map(pair => pair.value),
    anchor: rotatedAnchor,
  };
}

export function createBoard(rng: () => number = Math.random, boardSize: BoardSize = DEFAULT_BOARD_SIZE): GameBoard {
  return Array.from({ length: boardSize }, () =>
    Array.from({ length: boardSize }, () => ({
      base: weightedPick(FIELD_WEIGHTS, rng),
      occupied: false,
      placed: null,
    })),
  );
}

export function createPiece(rng: () => number = Math.random): PieceState {
  const shape = SHAPES[Math.floor(rng() * SHAPES.length)] ?? SHAPES[0]!;
  return {
    cells: normalizeCells(shape.map(cell => [cell[0], cell[1]] as CellCoord)),
    values: Array.from({ length: 4 }, () => weightedPick(PIECE_WEIGHTS, rng)),
  };
}

export function cloneBoard(board: GameBoard): GameBoard {
  return board.map(row => row.map(cell => ({ ...cell })));
}

function getBoardSize(board: GameBoard): number {
  return board.length || DEFAULT_BOARD_SIZE;
}

export function canPlaceAt(board: GameBoard, cells: CellCoord[], col: number, row: number): boolean {
  const boardSize = getBoardSize(board);
  for (const [x, y] of cells) {
    const c = col + x;
    const r = row + y;
    if (c < 0 || c >= boardSize || r < 0 || r >= boardSize) return false;
    if (board[r]?.[c]?.occupied) return false;
  }
  return true;
}

export function canPlaceAnyPlacement(board: GameBoard, piece: PieceState): boolean {
  const boardSize = getBoardSize(board);
  for (let row = 0; row < boardSize; row++) {
    for (let col = 0; col < boardSize; col++) {
      if (canPlaceAt(board, piece.cells, col, row)) return true;
    }
  }
  return false;
}

export function shouldShowGameOver(board: GameBoard, piece: PieceState, score: number): boolean {
  return !canPlaceAnyPlacement(board, piece) && score < 10;
}

export function computePlacementTotal(board: GameBoard, piece: PieceState, col: number, row: number): number {
  const boardSize = getBoardSize(board);
  return piece.cells.reduce((total, [x, y], index) => {
    const c = col + x;
    const r = row + y;
    if (c < 0 || c >= boardSize || r < 0 || r >= boardSize) return total;
    const cell = board[r]?.[c];
    if (!cell) return total;
    return total + cell.base * (piece.values[index] ?? 0);
  }, 0);
}

export function placePiece(
  board: GameBoard,
  piece: PieceState,
  col: number,
  row: number,
): { board: GameBoard; gained: number; placedCells: PlacedCell[] } | null {
  if (!canPlaceAt(board, piece.cells, col, row)) return null;

  const nextBoard = cloneBoard(board);
  let gained = 0;
  const placedCells: PlacedCell[] = [];

  piece.cells.forEach(([x, y], index) => {
    const c = col + x;
    const r = row + y;
    const placedValue = piece.values[index] ?? 0;
    const cell = nextBoard[r]?.[c];
    if (!cell) return;
    cell.occupied = true;
    cell.placed = placedValue;
    gained += placedValue * cell.base;
    placedCells.push({ col: c, row: r, base: cell.base, placedValue });
  });

  return { board: nextBoard, gained, placedCells };
}

export function clearBoard(rng: () => number = Math.random, boardSize: BoardSize = DEFAULT_BOARD_SIZE): GameBoard {
  return createBoard(rng, boardSize);
}

export function createInitialGame(rng: () => number = Math.random, boardSize: BoardSize = DEFAULT_BOARD_SIZE) {
  return {
    board: createBoard(rng, boardSize),
    piece: createPiece(rng),
    score: 0,
    moves: 0,
  };
}

function isCellBase(value: unknown): value is CellBase {
  return value === 0 || value === 1 || value === 3 || value === 5 || value === 8;
}

function isCellCoord(value: unknown): value is CellCoord {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

export function isBoardSize(value: unknown): value is BoardSize {
  return BOARD_SIZES.includes(value as BoardSize);
}

function isGameBoard(value: unknown, boardSize: BoardSize): value is GameBoard {
  return (
    Array.isArray(value) &&
    value.length === boardSize &&
    value.every(row =>
      Array.isArray(row) &&
      row.length === boardSize &&
      row.every(cell =>
        cell &&
        typeof cell === 'object' &&
        isCellBase((cell as { base?: unknown }).base) &&
        typeof (cell as { occupied?: unknown }).occupied === 'boolean' &&
        ((cell as { placed?: unknown }).placed === null ||
          typeof (cell as { placed?: unknown }).placed === 'number'),
      ),
    )
  );
}

function isPieceState(value: unknown): value is PieceState {
  return (
    value !== null &&
    typeof value === 'object' &&
    Array.isArray((value as { cells?: unknown }).cells) &&
    Array.isArray((value as { values?: unknown }).values) &&
    (value as { cells: unknown[] }).cells.length === 4 &&
    (value as { values: unknown[] }).values.length === 4 &&
    (value as { cells: unknown[] }).cells.every(isCellCoord) &&
    (value as { values: unknown[] }).values.every(item => typeof item === 'number' && Number.isFinite(item))
  );
}

export function serializeGameState(state: SavedGameStateV1): string {
  return JSON.stringify(state);
}

export function deserializeGameState(raw: string): SavedGameStateV1 | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as { version?: unknown }).version !== 1
    ) {
      return null;
    }

    const rawBoardSize = (parsed as { boardSize?: unknown }).boardSize;
    if (rawBoardSize !== undefined && !isBoardSize(rawBoardSize)) {
      return null;
    }
    const boardSize = isBoardSize(rawBoardSize) ? rawBoardSize : DEFAULT_BOARD_SIZE;

    if (
      !isGameBoard((parsed as { board?: unknown }).board, boardSize) ||
      !isPieceState((parsed as { piece?: unknown }).piece) ||
      typeof (parsed as { score?: unknown }).score !== 'number' ||
      typeof (parsed as { moves?: unknown }).moves !== 'number' ||
      typeof (parsed as { gameOver?: unknown }).gameOver !== 'boolean'
    ) {
      return null;
    }

    return {
      version: 1,
      boardSize,
      board: (parsed as SavedGameStateV1).board,
      piece: (parsed as SavedGameStateV1).piece,
      score: (parsed as SavedGameStateV1).score,
      moves: (parsed as SavedGameStateV1).moves,
      gameOver: (parsed as SavedGameStateV1).gameOver,
    };
  } catch {
    return null;
  }
}
