import { useState } from 'react';
import { setVadOptions } from '../engine/session/controller';
import { useSnakk } from '../engine/store';

export function DebugDrawer() {
  const open = useSnakk((s) => s.drawerOpen);
  const topicState = useSnakk((s) => s.topicState);
  const opsLog = useSnakk((s) => s.opsLog);
  const segments = useSnakk((s) => s.segments);
  const override = useSnakk((s) => s.providerOverride);
  const vocabulary = useSnakk((s) => s.vocabulary);
  const set = useSnakk((s) => s.set);
  const [pause, setPause] = useState(800);
  const [interim, setInterim] = useState(true);
  if (!open) return null;

  const roots = topicState.order.filter((id) => !topicState.topics[id].parentId);
  return (
    <aside className="drawer">
      <section>
        <h2>Settings</h2>
        <label className="stack">
          <span>Names and terms you will say</span>
          <input
            type="text"
            value={vocabulary}
            placeholder="Tor, Nordlo Next, Whisper, react-three-fiber"
            onChange={(e) => set({ vocabulary: e.target.value })}
          />
        </label>
        <label className="row">
          <span>Pause that ends an utterance</span>
          <input
            type="range"
            min={400}
            max={1600}
            step={50}
            value={pause}
            onChange={(e) => {
              setPause(+e.target.value);
              setVadOptions({ redemptionMs: +e.target.value });
            }}
          />
          <output>{pause} ms</output>
        </label>
        <label className="row">
          <span>Live captions while speaking</span>
          <input
            type="checkbox"
            checked={interim}
            onChange={(e) => {
              setInterim(e.target.checked);
              setVadOptions({ interimEveryMs: e.target.checked ? 1800 : 0 });
            }}
          />
        </label>
        <label className="row">
          <span>Offline categorizer (no Claude)</span>
          <input type="checkbox" checked={override === 'offline'} onChange={(e) => set({ providerOverride: e.target.checked ? 'offline' : 'server' })} />
        </label>
      </section>

      <section>
        <h2>Topics</h2>
        {roots.length === 0 && <p className="muted">None yet.</p>}
        <ul className="tree">
          {roots.map((id) => (
            <TopicItem key={id} id={id}>
              <ul>
                {topicState.order
                  .filter((c) => topicState.topics[c].parentId === id)
                  .map((c) => (
                    <TopicItem key={c} id={c} />
                  ))}
              </ul>
            </TopicItem>
          ))}
        </ul>
      </section>

      <section>
        <h2>Categorizer calls</h2>
        <ol className="log">
          {[...opsLog].reverse().map((e) => (
            <li key={e.at + e.utterance} className={e.error ? 'err' : ''}>
              <div className="muted">
                {new Date(e.at).toLocaleTimeString()} · {e.provider} · {e.latencyMs} ms
              </div>
              <div className="utt">“{e.utterance}”</div>
              {e.error ? <div>{e.error}</div> : <pre>{e.applied.map(describeOp).join('\n') || '(no change)'}</pre>}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Transcript</h2>
        <ol className="log">
          {[...segments].reverse().map((s) => (
            <li key={s.id}>
              <span className="muted">
                {s.lang} · {s.latencyMs ?? 0} ms · {s.topicId ? topicState.topics[s.topicId]?.title : '…'}
              </span>
              <div>{s.text}</div>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

function TopicItem({ id, children }: { id: string; children?: React.ReactNode }) {
  const t = useSnakk((s) => s.topicState.topics[id]);
  const current = useSnakk((s) => s.topicState.currentTopicId === id);
  return (
    <li>
      <div className={current ? 'current' : ''}>
        <b>{t.title}</b> <span className="muted">· {t.weight} words</span>
      </div>
      {t.summary && <div className="muted">{t.summary}</div>}
      <div className="kw">{t.keywords.join(' · ')}</div>
      {children}
    </li>
  );
}

function describeOp(op: { op: string } & Record<string, unknown>): string {
  switch (op.op) {
    case 'new_topic':
      return `+ ${op.title}${op.parentId ? ` (under ${op.parentId})` : ''}: ${(op.keywords as string[]).join(', ')}`;
    case 'add_keywords':
      return `→ ${op.topicId}: ${(op.keywords as string[]).join(', ')}`;
    case 'rename':
      return `✎ ${op.topicId} = ${op.title}`;
    default:
      return `≈ ${op.topicId}: ${op.summary}`;
  }
}
