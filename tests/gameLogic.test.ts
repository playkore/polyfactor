import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  canPlaceAt,
  clearBoard,
  computePlacementTotal,
  deserializeGameState,
  createBoard,
  createPiece,
  serializeGameState,
  normalizeCells,
  placePiece,
  shouldShowGameOver,
  rotatePieceState,
  SIZE,
  type SavedGameStateV1,
  type GameBoard,
} from '../src/gameLogic';

function pairs(piece: { cells: readonly (readonly [number, number])[]; values: readonly number[] }) {
  return piece.cells.map((cell, index) => [cell, piece.values[index]] as const);
}

function constantRng(values: number[]) {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

test('normalizeCells shifts the shape to origin and sorts by row', () => {
  const cells = [[2, 3], [3, 3], [2, 4], [4, 4]];
  assert.deepEqual(normalizeCells(cells), [[0, 0], [1, 0], [0, 1], [2, 1]]);
});

test('rotatePieceState rotates cells and keeps values attached', () => {
  const piece = {
    cells: [[0, 0], [1, 0], [2, 0], [1, 1]],
    values: [10, 20, 30, 40],
  };

  const rotated = rotatePieceState(piece);

  assert.deepEqual(rotated.cells, [[0, 0], [0, 1], [1, 1], [0, 2]]);
  assert.deepEqual(rotated.values, [30, 20, 40, 10]);
});

test('four rotations return the original piece', () => {
  const piece = {
    cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
    values: [1, 3, 5, 8],
  };

  let rotated = piece;
  for (let index = 0; index < 4; index++) {
    rotated = rotatePieceState(rotated);
  }

  assert.deepEqual(pairs(rotated), pairs(piece));
});

test('rotatePieceState also rotates the drag anchor', () => {
  const piece = {
    cells: [[0, 0], [1, 0], [2, 0], [1, 1]],
    values: [10, 20, 30, 40],
  };

  const rotated = rotatePieceState(piece, { col: 1, row: 0 });

  assert.deepEqual(rotated.anchor, { col: 0, row: 1 });
});

test('createBoard builds the default 8x8 board', () => {
  const board = createBoard(constantRng([0, 0.5, 0.9]));
  assert.equal(board.length, SIZE);
  assert.equal(board[0]?.length, SIZE);
});

test('createBoard supports smaller board sizes', () => {
  const board = createBoard(constantRng([0, 0.5, 0.9]), 4);
  assert.equal(board.length, 4);
  assert.equal(board[0]?.length, 4);
});

test('createPiece returns four cells and four values', () => {
  const piece = createPiece(constantRng([0, 0.05, 0.25, 0.75, 0.95]));
  assert.equal(piece.cells.length, 4);
  assert.equal(piece.values.length, 4);
});

test('canPlaceAt and placePiece update the board predictably', () => {
  const board: GameBoard = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({ base: 1 as const, occupied: false, placed: null })),
  );
  const piece = {
    cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
    values: [1, 3, 5, 8],
  };

  assert.equal(canPlaceAt(board, piece.cells, 2, 3), true);
  const placed = placePiece(board, piece, 2, 3);
  assert.ok(placed);
  assert.equal(placed?.gained, 17);
  assert.equal(computePlacementTotal(board, piece, 2, 3), 17);
  assert.equal(placed?.board[3]?.[2]?.occupied, true);
  assert.equal(placed?.board[4]?.[3]?.placed, 8);
});

test('clearBoard returns a fresh empty board', () => {
  const board = clearBoard(constantRng([0.1, 0.2, 0.3]));
  assert.equal(board.length, SIZE);
  assert.equal(board[7]?.[7]?.occupied, false);
});

test('shouldShowGameOver stays false when reroll or rotation is affordable', () => {
  const board: GameBoard = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({ base: 1 as const, occupied: true, placed: 1 })),
  );
  const piece = {
    cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
    values: [1, 3, 5, 8],
  };

  assert.equal(shouldShowGameOver(board, piece, 4), true);
  assert.equal(shouldShowGameOver(board, piece, 5), true);
  assert.equal(shouldShowGameOver(board, piece, 9), true);
  assert.equal(shouldShowGameOver(board, piece, 10), false);
  assert.equal(shouldShowGameOver(board, piece, 100), false);
});


test('shouldShowGameOver considers paid or affordable rotations', () => {
  const board: GameBoard = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({ base: 1 as const, occupied: true, placed: 1 })),
  );
  board[0]![0] = { ...board[0]![0], occupied: false, placed: null };
  board[1]![0] = { ...board[1]![0], occupied: false, placed: null };
  board[2]![0] = { ...board[2]![0], occupied: false, placed: null };
  board[3]![0] = { ...board[3]![0], occupied: false, placed: null };
  const piece = {
    cells: [[0, 0], [1, 0], [2, 0], [3, 0]],
    values: [1, 3, 5, 8],
  };

  assert.equal(shouldShowGameOver(board, piece, 4), true);
  assert.equal(shouldShowGameOver(board, piece, 5), false);
  assert.equal(shouldShowGameOver(board, piece, 0, true), false);
});

test('serializeGameState round-trips a saved game snapshot', () => {
  const board = createBoard(constantRng([0, 0.5, 0.9]));
  const piece = createPiece(constantRng([0, 0.05, 0.25, 0.75, 0.95]));
  board[0]![0] = { ...board[0]![0], occupied: true, placed: 3 };
  board[2]![4] = { ...board[2]![4], occupied: true, placed: 8 };

  const saved: SavedGameStateV1 = {
    version: 1,
    boardSize: 8,
    board,
    piece,
    score: 42,
    moves: 7,
    gameOver: true,
    rotationPaidForCurrentPiece: true,
  };

  const restored = deserializeGameState(serializeGameState(saved));

  assert.deepEqual(restored, saved);
});

test('deserializeGameState restores a saved board size', () => {
  const board = createBoard(constantRng([0, 0.5, 0.9]), 4);
  const piece = createPiece(constantRng([0, 0.05, 0.25, 0.75, 0.95]));

  const restored = deserializeGameState(serializeGameState({
    version: 1,
    boardSize: 4,
    board,
    piece,
    score: 0,
    moves: 0,
    gameOver: false,
  }));

  assert.equal(restored?.boardSize, 4);
  assert.equal(restored?.board.length, 4);
});

test('deserializeGameState rejects an unsupported board size', () => {
  assert.equal(deserializeGameState(JSON.stringify({
    version: 1,
    boardSize: 5,
    board: createBoard(constantRng([0, 0.5, 0.9])),
    piece: createPiece(constantRng([0, 0.05, 0.25, 0.75, 0.95])),
    score: 0,
    moves: 0,
    gameOver: false,
  })), null);
});

test('deserializeGameState rejects a snapshot with a mismatched board size', () => {
  assert.equal(deserializeGameState(JSON.stringify({
    version: 1,
    boardSize: 4,
    board: createBoard(constantRng([0, 0.5, 0.9]), 8),
    piece: createPiece(constantRng([0, 0.05, 0.25, 0.75, 0.95])),
    score: 0,
    moves: 0,
    gameOver: false,
  })), null);
});

test('deserializeGameState rejects invalid snapshots', () => {
  assert.equal(deserializeGameState('not json'), null);
  assert.equal(
    deserializeGameState(JSON.stringify({ version: 1, board: [], piece: {}, score: 0, moves: 0, gameOver: false })),
    null,
  );
});
