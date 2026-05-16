import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCells, rotatePieceState } from './game-logic.mjs';

function pairs(piece) {
  return piece.cells.map((cell, i) => [cell, piece.values[i]]);
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
  for (let i = 0; i < 4; i++) {
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
