export function normalizeCells(cells) {
  const minX = Math.min(...cells.map(c => c[0]));
  const minY = Math.min(...cells.map(c => c[1]));
  return cells
    .map(([x, y]) => [x - minX, y - minY])
    .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
}

function normalizePairs(pairs) {
  const minX = Math.min(...pairs.map(p => p.cell[0]));
  const minY = Math.min(...pairs.map(p => p.cell[1]));
  return pairs
    .map(({ cell, value }) => ({
      cell: [cell[0] - minX, cell[1] - minY],
      value,
    }))
    .sort((a, b) => (a.cell[1] - b.cell[1]) || (a.cell[0] - b.cell[0]));
}

export function rotatePieceState(piece, anchor = null) {
  const rotated = piece.cells.map(([x, y], i) => ({
    cell: [y, -x],
    value: piece.values[i],
  }));
  const normalized = normalizePairs(rotated);

  let rotatedAnchor = null;
  if (anchor) {
    const anchorRotated = { cell: [anchor.row, -anchor.col], value: null };
    const minX = Math.min(...rotated.map(p => p.cell[0]));
    const minY = Math.min(...rotated.map(p => p.cell[1]));
    rotatedAnchor = {
      col: anchorRotated.cell[0] - minX,
      row: anchorRotated.cell[1] - minY,
    };
  }

  return {
    cells: normalized.map(p => p.cell),
    values: normalized.map(p => p.value),
    anchor: rotatedAnchor,
  };
}
