import { useEffect, useRef } from 'react';
import { createGameController } from './gameController';
import './styles.css';

export default function App() {
  const rootRef = useRef<HTMLElement | null>(null);
  const boardRef = useRef<HTMLCanvasElement | null>(null);
  const nextRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<HTMLCanvasElement | null>(null);
  const fxRef = useRef<HTMLCanvasElement | null>(null);
  const scoreRef = useRef<HTMLSpanElement | null>(null);
  const movesRef = useRef<HTMLSpanElement | null>(null);
  const rerollRef = useRef<HTMLButtonElement | null>(null);
  const clearRef = useRef<HTMLButtonElement | null>(null);
  const newRef = useRef<HTMLButtonElement | null>(null);
  const againRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const finalTextRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const registerServiceWorker = () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
        // Ignore registration failures so the game still works as a normal app.
      });
    };

    if (document.readyState === 'complete') {
      registerServiceWorker();
      return;
    }

    window.addEventListener('load', registerServiceWorker, { once: true });
    return () => window.removeEventListener('load', registerServiceWorker);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const boardCanvas = boardRef.current;
    const nextCanvas = nextRef.current;
    const dragCanvas = dragRef.current;
    const fxCanvas = fxRef.current;
    const scoreEl = scoreRef.current;
    const movesEl = movesRef.current;
    const rerollBtn = rerollRef.current;
    const clearBoardBtn = clearRef.current;
    const newBtn = newRef.current;
    const againBtn = againRef.current;
    const tooltipEl = tooltipRef.current;
    const overlayEl = overlayRef.current;
    const finalTextEl = finalTextRef.current;

    if (
      !root ||
      !boardCanvas ||
      !nextCanvas ||
      !dragCanvas ||
      !fxCanvas ||
      !scoreEl ||
      !movesEl ||
      !rerollBtn ||
      !clearBoardBtn ||
      !newBtn ||
      !againBtn ||
      !tooltipEl ||
      !overlayEl ||
      !finalTextEl
    ) {
      throw new Error('Tetramino UI failed to mount');
    }

    const controller = createGameController({
      root,
      boardCanvas,
      nextCanvas,
      dragCanvas,
      fxCanvas,
      scoreEl,
      movesEl,
      rerollBtn,
      clearBoardBtn,
      newBtn,
      againBtn,
      tooltipEl,
      overlayEl,
      finalTextEl,
    });

    return () => controller.destroy();
  }, []);

  return (
    <>
      <main className="game" ref={rootRef}>
        <section className="board-wrap">
          <canvas
            ref={boardRef}
            width={640}
            height={640}
            aria-label="8 by 8 game board"
            data-testid="board-canvas"
          />
        </section>

        <aside className="side">
          <h1>Tetramino<br />Multiplier</h1>

          <div className="actions">
            <button ref={newRef} data-testid="new-game-button">New game</button>
          </div>

          <div className="stats">
            <div className="stat">
              <b>Score</b>
              <span ref={scoreRef} data-testid="score">0</span>
            </div>
            <div className="stat">
              <b>Moves</b>
              <span ref={movesRef} data-testid="moves">0</span>
            </div>
          </div>

          <div className="top-panels">
            <div className="next-box">
              <div className="next-title">Current tetramino</div>
              <canvas ref={nextRef} width={200} height={200} data-testid="next-canvas" />
            </div>

            <div className="store-box">
              <div className="store-title">Store</div>
              <div className="store-item">
                <button ref={rerollRef} data-testid="reroll-button">Reroll -10</button>
              </div>
              <div className="store-item">
                <button ref={clearRef} data-testid="clear-board-button">Clear board -100</button>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <div className="tooltip" ref={tooltipRef} data-testid="tooltip" />
      <div className="overlay" ref={overlayRef} data-testid="game-over-overlay">
        <div className="modal">
          <h2>Game over</h2>
          <p ref={finalTextRef} data-testid="final-text" />
          <button ref={againRef} data-testid="play-again-button">Play again</button>
        </div>
      </div>
      <canvas ref={dragRef} aria-hidden="true" id="dragCanvas" data-testid="drag-canvas" />
      <canvas ref={fxRef} aria-hidden="true" id="fxCanvas" data-testid="fx-canvas" />
    </>
  );
}
