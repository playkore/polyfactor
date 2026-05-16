import {
  SIZE,
  VALUE_STYLES,
  canPlaceAt,
  clearBoard as createClearedBoard,
  computePlacementTotal,
  createBoard,
  createPiece,
  deserializeGameState,
  serializeGameState,
  placePiece,
  shouldShowGameOver,
  type SavedGameStateV1,
  type CellCoord,
  type GameBoard,
  type PieceState,
  type PlacedCell,
} from './gameLogic';

interface GameControllerElements {
  root: HTMLElement;
  boardCanvas: HTMLCanvasElement;
  nextCanvas: HTMLCanvasElement;
  dragCanvas: HTMLCanvasElement;
  fxCanvas: HTMLCanvasElement;
  scoreEl: HTMLElement;
  movesEl: HTMLElement;
  rerollBtn: HTMLButtonElement;
  clearBoardBtn: HTMLButtonElement;
  newBtn: HTMLButtonElement;
  againBtn: HTMLButtonElement;
  tooltipEl: HTMLDivElement;
  overlayEl: HTMLDivElement;
  finalTextEl: HTMLElement;
}

interface HoverState {
  col: number;
  row: number;
  valid: boolean;
}

interface DragPointer {
  x: number;
  y: number;
}

interface ParticleBase {
  life: number;
  ttl: number;
  color: string;
  size: number;
  drift?: number;
}

type Particle =
  | (ParticleBase & {
      kind: 'burst';
      x: number;
      y: number;
      vx: number;
      vy: number;
    })
  | (ParticleBase & {
      kind: 'spark';
      x: number;
      y: number;
      tx: number;
      ty: number;
    })
  | (ParticleBase & {
      kind: 'fly';
      x: number;
      y: number;
      tx: number;
      ty: number;
      text: string;
      wobble: number;
    });

interface PieceReveal {
  start: number;
  duration: number;
  strength: number;
}

interface ShakeEffect {
  power: number;
  start: number;
  end: number;
}

interface SpendResult {
  allowed: boolean;
}

const STORAGE_KEY = 'polyfactor.saved-game.v1';

function resizeCanvas(canvas: HTMLCanvasElement, logicalSize: number | null = null): boolean {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = logicalSize ? Math.max(1, Math.floor(canvas.clientHeight * dpr)) : width;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    return true;
  }
  return false;
}

function setCanvasTransform(ctx: CanvasRenderingContext2D): void {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getBoundingCellSize(canvas: HTMLCanvasElement): number {
  return canvas.width / SIZE;
}

export function createGameController(elements: GameControllerElements) {
  const ctx = elements.boardCanvas.getContext('2d');
  const nctx = elements.nextCanvas.getContext('2d');
  const dctx = elements.dragCanvas.getContext('2d');
  const fctx = elements.fxCanvas.getContext('2d');

  if (!ctx || !nctx || !dctx || !fctx) {
    throw new Error('Canvas 2D context is unavailable');
  }

  const boardCtx = ctx;
  const nextCtx = nctx;
  const dragCtx = dctx;
  const fxCtx = fctx;

  let board: GameBoard = createBoard();
  let piece: PieceState = createPiece();
  let score = 0;
  let moves = 0;
  let dragging = false;
  let hover: HoverState | null = null;
  let gameOver = false;
  let activePointerId: number | null = null;
  let dragPointer: DragPointer | null = null;
  let dragAnchor: CellCoord = [0, 0];
  let dragIsTouch = false;
  let fxParticles: Particle[] = [];
  let pieceReveal: PieceReveal | null = null;
  let shakeEffect: ShakeEffect | null = null;
  let fxRunning = false;
  let fxFrameId: number | null = null;
  let fxLastTime = 0;
  let destroyed = false;

  function buildSavedState(): SavedGameStateV1 {
    return {
      version: 1,
      board,
      piece,
      score,
      moves,
      gameOver,
    };
  }

  function saveGameState(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeGameState(buildSavedState()));
    } catch {
      // Ignore storage failures so gameplay continues normally.
    }
  }

  function loadSavedGameState(): SavedGameStateV1 | null {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? deserializeGameState(raw) : null;
    } catch {
      return null;
    }
  }

  function weightedShake(power: number, duration: number): void {
    shakeEffect = {
      power,
      start: performance.now(),
      end: performance.now() + duration,
    };
    ensureFxLoop();
  }

  function ensureFxLoop(): void {
    if (fxRunning || destroyed) return;
    fxRunning = true;
    fxLastTime = performance.now();
    fxFrameId = requestAnimationFrame(stepFx);
  }

  function addParticles(items: Particle[]): void {
    if (!items.length) return;
    fxParticles.push(...items);
    ensureFxLoop();
  }

  function spawnBurst({
    x,
    y,
    count = 16,
    speed = 260,
    color = '#f4cf6b',
    size = 6,
    spread = 1,
  }: {
    x: number;
    y: number;
    count?: number;
    speed?: number;
    color?: string;
    size?: number;
    spread?: number;
  }): void {
    const items: Particle[] = [];
    for (let index = 0; index < count; index++) {
      const angle = (Math.PI * 2 * index) / count + (Math.random() - 0.5) * 0.45;
      const velocity = speed * (0.55 + Math.random() * 0.7);
      items.push({
        kind: 'burst',
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 90,
        life: 0,
        ttl: 420 + Math.random() * 240,
        color,
        size: size * (0.7 + Math.random() * 0.7),
        drift: (Math.random() - 0.5) * spread,
      });
    }
    addParticles(items);
  }

  function spawnFlyToScore({ x, y, value, color = '#fff1d9' }: { x: number; y: number; value: number; color?: string }): void {
    const target = elements.scoreEl.getBoundingClientRect();
    const tx = target.left + target.width / 2;
    const ty = target.top + target.height / 2;
    addParticles([
      {
        kind: 'fly',
        x,
        y,
        tx,
        ty,
        life: 0,
        ttl: 720,
        color,
        size: 16,
        text: `+${value}`,
        wobble: Math.random() * Math.PI * 2,
      },
    ]);
  }

  function spawnScoreTrail(cells: PlacedCell[], total: number): void {
    if (!cells.length) return;
    const target = elements.scoreEl.getBoundingClientRect();
    const tx = target.left + target.width / 2;
    const ty = target.top + target.height / 2;
    const items: Particle[] = [];
    let centerX = 0;
    let centerY = 0;
    const rect = elements.boardCanvas.getBoundingClientRect();
    const s = rect.width / SIZE;

    for (const cell of cells) {
      const color = VALUE_STYLES[cell.base].fg;
      const x = rect.left + (cell.col + 0.5) * s;
      const y = rect.top + (cell.row + 0.5) * s;
      centerX += x;
      centerY += y;
      items.push({
        kind: 'spark',
        x,
        y,
        tx,
        ty,
        life: 0,
        ttl: 580 + Math.random() * 260,
        color,
        size: 4 + Math.random() * 4,
        drift: (Math.random() - 0.5) * 140,
      });
    }

    addParticles(items);
    centerX /= cells.length;
    centerY /= cells.length;
    spawnFlyToScore({
      x: centerX,
      y: centerY,
      value: total,
      color: '#fff8df',
    });
  }

  function spawnBoardClearParticles(occupiedCells: PlacedCell[]): void {
    const rect = elements.boardCanvas.getBoundingClientRect();
    const s = rect.width / SIZE;
    const items: Particle[] = [];

    for (const cell of occupiedCells) {
      const cx = rect.left + (cell.col + 0.5) * s;
      const cy = rect.top + (cell.row + 0.5) * s;
      const style = VALUE_STYLES[cell.base];
      for (let index = 0; index < 4; index++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 120 + Math.random() * 260;
        items.push({
          kind: 'burst',
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40,
          life: 0,
          ttl: 380 + Math.random() * 240,
          color: style.fg,
          size: 4 + Math.random() * 4,
          drift: (Math.random() - 0.5) * 60,
        });
      }
    }

    addParticles(items);
  }

  function spawnPreviewBurst(sourceCanvas: HTMLCanvasElement, cells: CellCoord[], strength = 1): void {
    const rect = sourceCanvas.getBoundingClientRect();
    const maxX = Math.max(...cells.map(cell => cell[0]));
    const maxY = Math.max(...cells.map(cell => cell[1]));
    const block = Math.max(24, Math.min(52, Math.floor(Math.min(rect.width, rect.height) / 10)));
    const ox = Math.floor((rect.width - (maxX + 1) * block) / 2);
    const oy = Math.floor((rect.height - (maxY + 1) * block) / 2);
    const items: Particle[] = [];

    for (const [x, y] of cells) {
      const cx = rect.left + ox + x * block + block / 2;
      const cy = rect.top + oy + y * block + block / 2;
      items.push({
        kind: 'burst',
        x: cx,
        y: cy,
        vx: (Math.random() - 0.5) * 260 * strength,
        vy: (Math.random() - 0.75) * 280 * strength,
        life: 0,
        ttl: 420 + Math.random() * 260,
        color: '#fff1d9',
        size: 5 + Math.random() * 5,
        drift: (Math.random() - 0.5) * 90,
      });
    }

    addParticles(items);
  }

  function triggerPieceReveal(strength = 1): void {
    pieceReveal = {
      start: performance.now(),
      duration: 280 + 80 * strength,
      strength,
    };
    ensureFxLoop();
  }

  function resizeFxCanvas(): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(window.innerWidth * dpr));
    const height = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (elements.fxCanvas.width !== width || elements.fxCanvas.height !== height) {
      elements.fxCanvas.width = width;
      elements.fxCanvas.height = height;
    }
    setCanvasTransform(fxCtx);
  }

  function resizeDragCanvas(): void {
    setCanvasTransform(dragCtx);
  }

  function resizeCanvases(): void {
    const boardChanged = resizeCanvas(elements.boardCanvas);
    const nextChanged = resizeCanvas(elements.nextCanvas);
    resizeDragCanvas();
    if (boardChanged || nextChanged) draw();
    if (dragging) {
      drawDragPreview();
    }
  }

  function updateStats(): void {
    elements.scoreEl.textContent = String(score);
    elements.movesEl.textContent = String(moves);
    updateStoreButtons();
  }

  function updateStoreButtons(): void {
    elements.rerollBtn.disabled = score < 10;
    elements.clearBoardBtn.disabled = score < 100;
  }

  function setCurrentPiece(nextPiece: PieceState, revealStrength = 1): void {
    piece = nextPiece;
    dragging = false;
    dragPointer = null;
    dragAnchor = [0, 0];
    hover = null;
    triggerPieceReveal(revealStrength);
  }

  function regenerateBoard(): void {
    board = createClearedBoard();
  }

  function newGame(): void {
    board = createBoard();
    score = 0;
    moves = 0;
    piece = createPiece();
    dragging = false;
    dragPointer = null;
    hover = null;
    gameOver = false;
    elements.overlayEl.classList.remove('show');
    triggerPieceReveal(1.2);
    updateStats();
    resizeCanvases();
    checkGameOver();
    saveGameState();
    draw();
  }

  function restoreGameState(savedState: SavedGameStateV1): void {
    board = savedState.board;
    piece = savedState.piece;
    score = savedState.score;
    moves = savedState.moves;
    gameOver = savedState.gameOver;
    dragging = false;
    dragPointer = null;
    hover = null;
    activePointerId = null;
    dragIsTouch = false;
    triggerPieceReveal(1);
    updateStats();
    resizeCanvases();
    checkGameOver();
    saveGameState();
    draw();
  }

  function getPointerCellAt(clientX: number, clientY: number): { col: number; row: number; inside: boolean } {
    const rect = elements.boardCanvas.getBoundingClientRect();
    const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    const x = ((clientX - rect.left) / rect.width) * elements.boardCanvas.width;
    const y = ((clientY - rect.top) / rect.height) * elements.boardCanvas.height;
    return {
      col: Math.floor(x / getBoundingCellSize(elements.boardCanvas)),
      row: Math.floor(y / getBoundingCellSize(elements.boardCanvas)),
      inside,
    };
  }

  function getDragLift(): number {
    const maxX = Math.max(...piece.cells.map(cell => cell[0]));
    const maxY = Math.max(...piece.cells.map(cell => cell[1]));
    const block = Math.max(24, Math.min(52, Math.floor(Math.min(window.innerWidth, window.innerHeight) / 10)));
    return Math.max(28, Math.round(block * 1.1));
  }

  function getDragPreviewOffset(): number {
    if (!dragIsTouch) return 0;
    const block = Math.max(24, Math.min(52, Math.floor(Math.min(window.innerWidth, window.innerHeight) / 10)));
    const maxY = Math.max(...piece.cells.map(cell => cell[1]));
    const pieceHeight = (maxY + 1) * block;
    return Math.max(28, Math.round(block * 0.9)) + pieceHeight;
  }

  function getDragAnchorFromPreview(e: PointerEvent): CellCoord {
    const rect = elements.nextCanvas.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const maxX = Math.max(...piece.cells.map(cell => cell[0]));
    const maxY = Math.max(...piece.cells.map(cell => cell[1]));
    const block = Math.floor(rect.width / Math.max(maxX + 2, maxY + 2, 4));
    const ox = Math.floor((rect.width - (maxX + 1) * block) / 2);
    const oy = Math.floor((rect.height - (maxY + 1) * block) / 2);

    let best: CellCoord = piece.cells[0] ?? [0, 0];
    let bestDist = Number.POSITIVE_INFINITY;
    for (const [x, y] of piece.cells) {
      const cx = ox + x * block + block / 2;
      const cy = oy + y * block + block / 2;
      const dist = Math.hypot(localX - cx, localY - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = [x, y];
      }
    }

    return best;
  }

  function updateHoverFromPointer(clientX: number, clientY: number): void {
    const lift = dragging ? getDragLift() : 0;
    const previewOffset = dragging ? getDragPreviewOffset() : 0;
    const point = getPointerCellAt(clientX, clientY - lift - previewOffset);
    if (!point.inside) {
      hover = null;
      return;
    }
    const col = point.col - dragAnchor[0];
    const row = point.row - dragAnchor[1];
    hover = {
      col,
      row,
      valid: canPlaceAt(board, piece.cells, col, row),
    };
  }

  function computeHoverTotal(): number {
    if (!hover) return 0;
    return computePlacementTotal(board, piece, hover.col, hover.row);
  }

  function drawCellBackground(x: number, y: number, size: number, cell: { base: keyof typeof VALUE_STYLES; occupied: boolean }): void {
    const style = VALUE_STYLES[cell.base as 0 | 1 | 3 | 5 | 8] ?? VALUE_STYLES[0];
    boardCtx.fillStyle = cell.occupied ? '#101412' : style.bg;
    boardCtx.fillRect(x, y, size, size);
  }

  function drawBoard(): void {
    const size = getBoundingCellSize(elements.boardCanvas);
    boardCtx.clearRect(0, 0, elements.boardCanvas.width, elements.boardCanvas.height);

    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const x = col * size;
        const y = row * size;
        const cell = board[row]?.[col];
        if (!cell) continue;
        drawCellBackground(x, y, size, cell);
        boardCtx.strokeStyle = '#101412';
        boardCtx.lineWidth = 3;
        boardCtx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
        boardCtx.fillStyle = VALUE_STYLES[cell.base].fg;
        boardCtx.font = `800 ${Math.floor(size * 0.34)}px ui-monospace, monospace`;
        boardCtx.textAlign = 'center';
        boardCtx.textBaseline = 'middle';
        boardCtx.fillText(String(cell.base), x + size / 2, y + size / 2);
      }
    }
  }

  function drawGhost(): void {
    const currentHover = hover;
    if (!currentHover || !dragging) return;
    const size = getBoundingCellSize(elements.boardCanvas);
    const fill = currentHover.valid ? '#b9d58b' : '#d88d7c';
    const outline = currentHover.valid ? '#314d19' : '#6b1e16';

    boardCtx.save();
    boardCtx.globalAlpha = 0.92;
    piece.cells.forEach(([x, y], index) => {
      const c = currentHover.col + x;
      const r = currentHover.row + y;
      if (c < 0 || c >= SIZE || r < 0 || r >= SIZE) return;
      const px = c * size;
      const py = r * size;
      const base = board[r]?.[c]?.base ?? 0;
      const pieceValue = piece.values[index] ?? 0;
      const previewScore = base * pieceValue;

      boardCtx.fillStyle = fill;
      boardCtx.fillRect(px + 3, py + 3, size - 6, size - 6);
      boardCtx.strokeStyle = outline;
      boardCtx.lineWidth = 6;
      boardCtx.strokeRect(px + 6, py + 6, size - 12, size - 12);
      boardCtx.strokeStyle = '#101412';
      boardCtx.lineWidth = 2;
      boardCtx.strokeRect(px + 13, py + 13, size - 26, size - 26);

      boardCtx.fillStyle = '#101412';
      boardCtx.font = `800 ${Math.floor(size * 0.34)}px ui-monospace, monospace`;
      boardCtx.textAlign = 'center';
      boardCtx.textBaseline = 'middle';
      boardCtx.fillText(String(pieceValue), px + size / 2, py + size * 0.45);

      boardCtx.font = `800 ${Math.floor(size * 0.16)}px ui-monospace, monospace`;
      boardCtx.fillText(`+${previewScore}`, px + size / 2, py + size * 0.72);
    });

    boardCtx.restore();
  }

  function drawNext(now = performance.now()): void {
    const w = elements.nextCanvas.width;
    nextCtx.clearRect(0, 0, w, w);
    nextCtx.fillStyle = '#f8f1d8';
    nextCtx.fillRect(0, 0, w, w);

    const reveal = pieceReveal ? Math.max(0, Math.min(1, (now - pieceReveal.start) / pieceReveal.duration)) : 1;
    const pop = pieceReveal ? 0.72 + 0.28 * (1 - Math.pow(1 - reveal, 3)) : 1;
    const spin = pieceReveal ? (1 - reveal) * 0.18 : 0;

    const maxX = Math.max(...piece.cells.map(cell => cell[0]));
    const maxY = Math.max(...piece.cells.map(cell => cell[1]));
    const block = Math.floor(w / Math.max(maxX + 2, maxY + 2, 4));
    const ox = Math.floor((w - (maxX + 1) * block) / 2);
    const oy = Math.floor((w - (maxY + 1) * block) / 2);

    nextCtx.save();
    nextCtx.translate(w / 2, w / 2);
    nextCtx.scale(pop, pop);
    nextCtx.rotate(spin);
    nextCtx.translate(-w / 2, -w / 2);

    piece.cells.forEach(([x, y], index) => {
      const px = ox + x * block;
      const py = oy + y * block;
      const style = VALUE_STYLES[piece.values[index] as 0 | 1 | 3 | 5 | 8] ?? VALUE_STYLES[0];
      nextCtx.fillStyle = style.bg;
      nextCtx.fillRect(px + 4, py + 4, block - 8, block - 8);
      nextCtx.strokeStyle = '#101412';
      nextCtx.lineWidth = 3;
      nextCtx.strokeRect(px + 4, py + 4, block - 8, block - 8);
      nextCtx.fillStyle = style.fg;
      nextCtx.font = `800 ${Math.floor(block * 0.38)}px ui-monospace, monospace`;
      nextCtx.textAlign = 'center';
      nextCtx.textBaseline = 'middle';
      nextCtx.fillText(String(piece.values[index] ?? 0), px + block / 2, py + block / 2);
    });

    nextCtx.restore();
  }

  function drawDragPreview(): void {
    if (!dragging || !dragPointer) {
      elements.dragCanvas.style.display = 'none';
      return;
    }

    elements.dragCanvas.style.display = 'block';

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const maxX = Math.max(...piece.cells.map(cell => cell[0]));
    const maxY = Math.max(...piece.cells.map(cell => cell[1]));
    const block = Math.max(24, Math.min(52, Math.floor(Math.min(window.innerWidth, window.innerHeight) / 10)));
    const pad = 4;
    const w = (maxX + 1) * block + pad * 2;
    const h = (maxY + 1) * block + pad * 2;
    const lift = getDragLift();
    const previewOffset = getDragPreviewOffset();
    const anchorX = pad + dragAnchor[0] * block + block / 2;
    const anchorY = pad + dragAnchor[1] * block + block / 2;

    elements.dragCanvas.style.width = `${w}px`;
    elements.dragCanvas.style.height = `${h}px`;
    elements.dragCanvas.style.left = `${Math.round(dragPointer.x - anchorX)}px`;
    elements.dragCanvas.style.top = `${Math.round(dragPointer.y - anchorY - lift - previewOffset)}px`;

    if (elements.dragCanvas.width !== Math.round(w * dpr) || elements.dragCanvas.height !== Math.round(h * dpr)) {
      elements.dragCanvas.width = Math.round(w * dpr);
      elements.dragCanvas.height = Math.round(h * dpr);
    }
    setCanvasTransform(dragCtx);
    dragCtx.clearRect(0, 0, w, h);

    dragCtx.save();
    dragCtx.globalAlpha = 0.55;

    piece.cells.forEach(([x, y], index) => {
      const px = pad + x * block;
      const py = pad + y * block;
      const style = VALUE_STYLES[piece.values[index] as 0 | 1 | 3 | 5 | 8] ?? VALUE_STYLES[0];

      dragCtx.fillStyle = style.bg;
      dragCtx.fillRect(px + 3, py + 3, block - 6, block - 6);
      dragCtx.strokeStyle = '#101412';
      dragCtx.lineWidth = 3;
      dragCtx.strokeRect(px + 3, py + 3, block - 6, block - 6);

      dragCtx.fillStyle = style.fg;
      dragCtx.font = `800 ${Math.floor(block * 0.34)}px ui-monospace, monospace`;
      dragCtx.textAlign = 'center';
      dragCtx.textBaseline = 'middle';
      dragCtx.fillText(String(piece.values[index] ?? 0), px + block / 2, py + block / 2);
    });

    dragCtx.restore();
  }

  function updateTooltip(): void {
    if (!dragging || !hover) {
      elements.tooltipEl.classList.remove('show', 'bad', 'below');
      return;
    }

    const total = computeHoverTotal();
    elements.tooltipEl.textContent = hover.valid ? `Total: ${total} pts` : 'Cannot place here';
    elements.tooltipEl.classList.add('show');
    elements.tooltipEl.classList.toggle('bad', !hover.valid);

    const dragRect = elements.dragCanvas.getBoundingClientRect();
    const tipWidth = elements.tooltipEl.offsetWidth;
    const tipHeight = elements.tooltipEl.offsetHeight;
    const pointerX = dragPointer?.x ?? dragRect.left + dragRect.width / 2;
    const pointerY = dragPointer?.y ?? dragRect.top;
    const lift = getDragLift();
    const left = pointerX;
    const below = dragIsTouch;
    let top = below
      ? dragRect.bottom + 10
      : pointerY - lift - tipHeight - 10;
    if (!below && top < 12) {
      top = pointerY - lift + 10;
    }
    elements.tooltipEl.classList.toggle('below', below);
    elements.tooltipEl.style.left = `${Math.max(12 + tipWidth / 2, Math.min(window.innerWidth - 12 - tipWidth / 2, left))}px`;
    elements.tooltipEl.style.top = `${Math.max(12, Math.min(window.innerHeight - 12 - tipHeight, top))}px`;
  }

  function draw(now = performance.now()): void {
    drawBoard();
    drawGhost();
    drawNext(now);
    updateTooltip();
    updateStoreButtons();
  }

  function stepFx(now: number): void {
    if (destroyed) {
      fxRunning = false;
      return;
    }

    const dt = Math.min(40, now - fxLastTime);
    fxLastTime = now;
    resizeFxCanvas();

    let alive = false;
    let shakeX = 0;
    let shakeY = 0;

    if (shakeEffect) {
      const t = (now - shakeEffect.start) / (shakeEffect.end - shakeEffect.start);
      if (t >= 1) {
        shakeEffect = null;
      } else {
        const falloff = 1 - t;
        const amp = shakeEffect.power * falloff;
        shakeX = (Math.random() - 0.5) * amp;
        shakeY = (Math.random() - 0.5) * amp;
        alive = true;
      }
    }

    elements.root.style.transform = `translate(${shakeX}px, ${shakeY}px)`;

    if (pieceReveal && now - pieceReveal.start < pieceReveal.duration) {
      alive = true;
      draw(now);
    } else if (pieceReveal) {
      pieceReveal = null;
      draw(now);
    }

    fxCtx.clearRect(0, 0, elements.fxCanvas.width, elements.fxCanvas.height);
    if (fxParticles.length) {
      const nextParticles: Particle[] = [];
      for (const particle of fxParticles) {
        particle.life += dt;
        const t = Math.min(1, particle.life / particle.ttl);
        if (t >= 1) continue;
        alive = true;
        const ease = 1 - Math.pow(1 - t, 3);
        const x = particle.kind === 'burst' ? particle.x + particle.vx * (particle.life / 1000) + Math.sin(t * Math.PI * 2) * (particle.drift ?? 0) * (1 - t) : particle.x;
        const y = particle.kind === 'burst' ? particle.y + particle.vy * (particle.life / 1000) + 260 * t * t : particle.y;
        const alpha = 1 - t;
        fxCtx.save();
        fxCtx.globalAlpha = alpha;
        if (particle.kind === 'fly') {
          const fx = particle.x + (particle.tx - particle.x) * ease + Math.sin((t + 0.12) * Math.PI * 3) * 16;
          const fy = particle.y + (particle.ty - particle.y) * ease - Math.sin(t * Math.PI) * 48;
          const cx = Math.max(12, Math.min(window.innerWidth - 12, fx));
          const cy = Math.max(12, Math.min(window.innerHeight - 12, fy));
          fxCtx.fillStyle = particle.color;
          fxCtx.strokeStyle = '#101412';
          fxCtx.lineWidth = 2;
          fxCtx.font = '800 18px ui-monospace, monospace';
          fxCtx.textAlign = 'center';
          fxCtx.textBaseline = 'middle';
          fxCtx.translate(cx, cy);
          fxCtx.rotate(Math.sin(t * Math.PI * 2) * 0.12);
          fxCtx.fillText(particle.text, 0, 0);
          fxCtx.strokeText(particle.text, 0, 0);
        } else if (particle.kind === 'spark') {
          const fx = particle.x + (particle.tx - particle.x) * ease + Math.sin(t * Math.PI * 4) * 8;
          const fy = particle.y + (particle.ty - particle.y) * ease - Math.sin(t * Math.PI) * 34;
          const cx = Math.max(10, Math.min(window.innerWidth - 10, fx));
          const cy = Math.max(10, Math.min(window.innerHeight - 10, fy));
          fxCtx.fillStyle = particle.color;
          fxCtx.beginPath();
          fxCtx.arc(cx, cy, particle.size * (1 - t * 0.2), 0, Math.PI * 2);
          fxCtx.fill();
        } else {
          const cx = Math.max(10, Math.min(window.innerWidth - 10, x));
          const cy = Math.max(10, Math.min(window.innerHeight - 10, y));
          fxCtx.fillStyle = particle.color;
          fxCtx.beginPath();
          fxCtx.arc(cx, cy, particle.size * (1 - t * 0.2), 0, Math.PI * 2);
          fxCtx.fill();
        }
        fxCtx.restore();
        nextParticles.push(particle);
      }
      fxParticles = nextParticles;
    }

    if (!alive) {
      elements.root.style.transform = '';
      fxRunning = false;
      fxCtx.clearRect(0, 0, elements.fxCanvas.width, elements.fxCanvas.height);
      return;
    }

    fxFrameId = requestAnimationFrame(stepFx);
  }

  function checkGameOver(): void {
    gameOver = shouldShowGameOver(board, piece, score);
    if (gameOver) {
      elements.finalTextEl.textContent = `Final score: ${score}. Moves made: ${moves}.`;
      elements.overlayEl.classList.add('show');
    } else {
      elements.finalTextEl.textContent = '';
      elements.overlayEl.classList.remove('show');
    }
  }

  function setGameOverVisible(visible: boolean): void {
    gameOver = !visible ? false : gameOver;
    elements.overlayEl.classList.toggle('show', visible);
  }

  function placeCurrentPiece(col: number, row: number): boolean {
    const result = placePiece(board, piece, col, row);
    if (!result) return false;

    board = result.board;
    score += result.gained;
    moves += 1;
    weightedShake(Math.min(14, 6 + Math.ceil(result.gained / 12)), 220);
    spawnScoreTrail(result.placedCells, result.gained);
    setCurrentPiece(createPiece(), 1.15);
    updateStats();
    checkGameOver();
    saveGameState();
    draw();
    return true;
  }

  function spendScore(cost: number, action: () => void): SpendResult {
    if (score < cost) return { allowed: false };
    score -= cost;
    action();
    gameOver = false;
    elements.overlayEl.classList.remove('show');
    updateStats();
    draw();
    checkGameOver();
    saveGameState();
    return { allowed: true };
  }

  function rerollPiece(): boolean {
    return spendScore(10, () => {
      spawnPreviewBurst(elements.nextCanvas, piece.cells, 1.2);
      setCurrentPiece(createPiece(), 1.4);
    }).allowed;
  }

  function clearBoardAction(): boolean {
    return spendScore(100, () => {
      const occupiedCells: PlacedCell[] = [];
      for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
          const cell = board[row]?.[col];
          if (cell?.occupied) {
            occupiedCells.push({
              col,
              row,
              base: cell.base,
              placedValue: cell.placed ?? 0,
            });
          }
        }
      }
      spawnBoardClearParticles(occupiedCells);
      regenerateBoard();
      weightedShake(12, 240);
      draw();
    }).allowed;
  }

  function requestNewGame(): void {
    const confirmed = window.confirm('Start a new game? Your current progress will be lost.');
    if (!confirmed) return;
    newGame();
  }

  function updateHoverFromEvent(e: PointerEvent): void {
    updateHoverFromPointer(e.clientX, e.clientY);
    draw();
  }

  function beginDrag(e: PointerEvent): void {
    if (gameOver) return;
    dragging = true;
    activePointerId = e.pointerId;
    dragIsTouch = e.pointerType === 'touch';
    dragPointer = { x: e.clientX, y: e.clientY };
    dragAnchor = e.currentTarget === elements.nextCanvas ? getDragAnchorFromPreview(e) : [0, 0];
    updateHoverFromPointer(e.clientX, e.clientY);
    if (e.currentTarget instanceof HTMLCanvasElement) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    drawDragPreview();
    draw();
  }

  function moveDrag(e: PointerEvent): void {
    if (!dragging || gameOver || e.pointerId !== activePointerId) return;
    dragPointer = { x: e.clientX, y: e.clientY };
    updateHoverFromPointer(e.clientX, e.clientY);
    drawDragPreview();
    draw();
  }

  function endDrag(e: PointerEvent): void {
    if (!dragging || gameOver || e.pointerId !== activePointerId) return;
    if (hover?.valid) {
      placeCurrentPiece(hover.col, hover.row);
    }
    dragging = false;
    activePointerId = null;
    dragIsTouch = false;
    hover = null;
    dragPointer = null;
    draw();
    drawDragPreview();
  }

  function cancelDrag(): void {
    dragging = false;
    activePointerId = null;
    dragIsTouch = false;
    hover = null;
    dragPointer = null;
    draw();
    drawDragPreview();
  }

  const handleResize = (): void => resizeCanvases();

  elements.nextCanvas.addEventListener('pointerdown', beginDrag);
  elements.boardCanvas.addEventListener('pointerdown', beginDrag);
  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', cancelDrag);
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);
  elements.newBtn.addEventListener('click', requestNewGame);
  elements.againBtn.addEventListener('click', newGame);
  elements.rerollBtn.addEventListener('click', rerollPiece);
  elements.clearBoardBtn.addEventListener('click', clearBoardAction);

  const savedState = loadSavedGameState();
  if (savedState) {
    restoreGameState(savedState);
  } else {
    newGame();
  }

  return {
    destroy() {
      destroyed = true;
      fxRunning = false;
      if (fxFrameId !== null) {
        cancelAnimationFrame(fxFrameId);
      }
      elements.nextCanvas.removeEventListener('pointerdown', beginDrag);
      elements.boardCanvas.removeEventListener('pointerdown', beginDrag);
      window.removeEventListener('pointermove', moveDrag);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', cancelDrag);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      elements.newBtn.removeEventListener('click', requestNewGame);
      elements.againBtn.removeEventListener('click', newGame);
      elements.rerollBtn.removeEventListener('click', rerollPiece);
      elements.clearBoardBtn.removeEventListener('click', clearBoardAction);
      elements.root.style.transform = '';
    },
  };
}
