import { useEffect, useMemo, useRef } from 'react';
import { sectionHops, talkView, useSnakk } from '../../engine';
import { BOARD, FONT, layoutBoard, textWidth, type Board, type BoardSection, type BoardSub, type Written } from './board';
import { chalkArrow, chalkEllipse, chalkUnderline } from './chalk';

/** Coloured chalk: sections take them in order, sub-topics share their section's. */
const CHALK = ['#f3e38a', '#9cc9ee', '#f2a7b8', '#a8dba0', '#f5c08a', '#c9b3ee', '#8fe0d6'];
const chalkFor = (i: number) => CHALK[((i % CHALK.length) + CHALK.length) % CHALK.length];
const WRITE_MS_PER_CHAR = 45;

/**
 * A 2D chalkboard. Sections are circled in coloured chalk with their keywords written underneath,
 * sub-topics hang off them on arrows, and arrows between sections trace the path of the talk.
 * Everything is drawn on as it arrives and never moves; the view pans and zooms out as the board fills.
 */
export function Chalkboard() {
  const topicState = useSnakk((s) => s.topicState);
  const board = useMemo(() => layoutBoard(talkView(topicState), sectionHops(topicState)), [topicState]);
  const svg = useViewBoxFollow(board);

  return (
    <div className="chalkboard">
      <svg ref={svg} className="chalk-svg" viewBox={`0 0 ${BOARD.cols * BOARD.cellW} 1000`} preserveAspectRatio="xMidYMin meet">
        <defs>
          <filter id="chalk" x="-5%" y="-5%" width="110%" height="110%">
            {/* Grain: chalk only sticks to the high points of the board. */}
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="noise" />
            <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.7 0 0 0 1.6" result="grain" />
            <feComposite in="SourceGraphic" in2="grain" operator="in" result="grained" />
            {/* Ragged edges. */}
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="9" result="wobble" />
            <feDisplacementMap in="grained" in2="wobble" scale="3.5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <g filter="url(#chalk)">
          {board.arrows.map((a) => {
            const { shaft, head } = chalkArrow(a);
            return (
              <g key={a.id} className={`arrow ${a.kind}`}>
                <path className="draw" pathLength={1} d={shaft} />
                <path className="draw head" pathLength={1} d={head} />
              </g>
            );
          })}
          {board.sections.map((s) => (
            <Section key={s.topic.id} s={s} />
          ))}
        </g>
      </svg>
    </div>
  );
}

function Section({ s }: { s: BoardSection }) {
  const color = chalkFor(s.topic.colorIndex);
  const { x, y, ry } = s.shape;
  const lineH = FONT.title * 1.05;
  const top = y - ((s.lines.length - 1) * lineH) / 2 + FONT.title * 0.32;
  const titleW = Math.max(...s.lines.map((l) => textWidth(l, FONT.title)));
  return (
    <g className={`section${s.current ? ' current' : ''}`} style={{ '--chalk': color } as React.CSSProperties}>
      <path className="draw ring" pathLength={1} d={chalkEllipse(s.shape, s.topic.id)} />
      {/* Circled again each time the talk comes back to it. */}
      {s.current && <path key={s.topic.lastActiveAt} className="draw ring again" pathLength={1} d={chalkEllipse({ ...s.shape, rx: s.shape.rx + 9, ry: s.shape.ry + 7 }, s.topic.id + 'again')} />}
      <text className="title" textAnchor="middle" fontSize={FONT.title}>
        {s.lines.map((l, i) => (
          <tspan key={i} x={x} y={top + i * lineH}>
            <WriteOn text={l} delayMs={350 + i * l.length * WRITE_MS_PER_CHAR} />
          </tspan>
        ))}
      </text>
      {s.current && <path className="draw underline" pathLength={1} d={chalkUnderline(x - titleW / 2, x + titleW / 2, y + ry - 16, s.topic.id)} />}
      {s.keywords.map((k) => (
        <Keyword key={k.text} k={k} />
      ))}
      {s.more > 0 && (
        <text className="keyword more" x={s.morePos.x} y={s.morePos.y} fontSize={FONT.keyword}>
          + {s.more} more
        </text>
      )}
      {s.subs.map((sub) => (
        <Sub key={sub.topic.id} sub={sub} />
      ))}
    </g>
  );
}

function Sub({ sub }: { sub: BoardSub }) {
  const { x, y } = sub.shape;
  const lineH = sub.size * 1.05;
  const top = y - ((sub.lines.length - 1) * lineH) / 2 + sub.size * 0.32;
  return (
    <g className={`sub${sub.active ? ' active' : ''}`}>
      <path className="draw ring" pathLength={1} d={chalkEllipse(sub.shape, sub.topic.id)} />
      <text className="title" textAnchor="middle" fontSize={sub.size}>
        {sub.lines.map((l, i) => (
          <tspan key={i} x={x} y={top + i * lineH}>
            {l}
          </tspan>
        ))}
      </text>
      {sub.keywords.map((k) => (
        <Keyword key={k.text} k={k} size={sub.keywordSize} />
      ))}
    </g>
  );
}

function Keyword({ k, size = FONT.keyword }: { k: Written; size?: number }) {
  return (
    <text className="keyword write" x={k.x} y={k.y} fontSize={size} transform={`rotate(${k.rot.toFixed(2)} ${k.x.toFixed(1)} ${k.y.toFixed(1)})`} style={writeStyle(k.text.length + 2, 0)}>
      – {k.text}
    </text>
  );
}

/** Text that appears left to right, as if being written. */
function WriteOn({ text, delayMs }: { text: string; delayMs: number }) {
  return (
    <tspan className="write" style={writeStyle(text.length, delayMs)}>
      {text}
    </tspan>
  );
}

const writeStyle = (chars: number, delayMs: number) =>
  ({ '--write-ms': `${chars * WRITE_MS_PER_CHAR}ms`, '--delay-ms': `${delayMs}ms` }) as React.CSSProperties;

/**
 * Fit the whole board between the top bar and the captions while it is small enough to read;
 * after that, hold a readable scale and follow the section being talked about. Eased, never jumps.
 */
function useViewBoxFollow(board: Board) {
  const ref = useRef<SVGSVGElement>(null);
  const target = useRef(board);
  target.current = board;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let vb = { x: 0, y: 0, w: BOARD.cols * BOARD.cellW, h: 1000 };
    let raf = 0;
    const tick = () => {
      const W = el.clientWidth || 1;
      const H = el.clientHeight || 1;
      const b = target.current.bounds;
      const pad = 50;
      const cw = b.x1 - b.x0 + pad * 2;
      const ch = b.y1 - b.y0 + pad * 2;
      // The board area: below the top bar, above the captions.
      const topPx = 64;
      const availH = H * 0.72 - topPx;
      const fit = Math.min(W / cw, availH / ch);
      const readable = Math.min(W / (BOARD.cols * BOARD.cellW + pad * 2), availH / (BOARD.cellH * 1.8));
      const s = Math.max(fit, readable);
      const w = W / s;
      const h = H / s;
      // Centred when it fits across; otherwise kept inside the board.
      let x = (b.x0 + b.x1) / 2 - w / 2;
      if (w < cw) x = Math.max(b.x0 - pad, Math.min(x, b.x1 + pad - w));
      let y = b.y0 - pad - topPx / s;
      if (s > fit + 1e-6) {
        // Too much to show at once: centre the current section's row, within the board.
        const cur = target.current.sections.find((sec) => sec.current) ?? target.current.sections.at(-1);
        if (cur) {
          const want = cur.shape.y + BOARD.cellH * 0.3 - (topPx / s + availH / s / 2);
          y = Math.max(b.y0 - pad - topPx / s, Math.min(want, b.y1 + pad - availH / s - topPx / s));
        }
      }
      const k = 0.06;
      vb = { x: vb.x + (x - vb.x) * k, y: vb.y + (y - vb.y) * k, w: vb.w + (w - vb.w) * k, h: vb.h + (h - vb.h) * k };
      el.setAttribute('viewBox', `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return ref;
}
