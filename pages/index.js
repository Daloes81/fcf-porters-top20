import { useState, useRef } from 'react';
import Head from 'next/head';

const EXAMPLE_URL = 'https://www.fcf.cat/classificacio/2526/futbol-11/segona-catalana/grup-1';

const STEPS = [
  { id: 1, label: 'Classificació' },
  { id: 2, label: 'Calendaris' },
  { id: 3, label: 'Actes (porters)' },
  { id: 4, label: 'Fitxes' },
  { id: 5, label: 'Rànquing' }
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [cached, setCached] = useState(false);
  const [stepStatus, setStepStatus] = useState({});
  const [log, setLog] = useState('');
  const abortRef = useRef(null);

  const reset = () => {
    setError(null);
    setResults(null);
    setCached(false);
    setStepStatus({});
    setLog('');
  };

  async function generate(targetUrl) {
    reset();
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/porters?url=${encodeURIComponent(targetUrl)}`, {
        signal: controller.signal
      });

      if (!res.body) throw new Error('El navegador no suporta streaming.');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop();

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          let msg;
          try {
            msg = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (msg.type === 'error') {
            setError(msg.message);
          } else if (msg.type === 'done') {
            setResults(msg.results);
            setCached(!!msg.cached);
          } else if (msg.step) {
            setStepStatus((prev) => ({
              ...prev,
              [msg.step]: msg.done ? 'done' : 'active'
            }));
            if (msg.msg) setLog(msg.msg);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Error inesperat');
      }
    } finally {
      setLoading(false);
    }
  }

  const onSubmit = (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    generate(url.trim());
  };

  return (
    <>
      <Head>
        <title>FCF Porters · Top 20 dels millors porters</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
          name="description"
          content="Rànquing dels 20 millors porters d'una lliga de la FCF, calculat a partir de les actes oficials i les estadístiques d'equip de fcf.cat."
        />
      </Head>

      <main>
        <div className="bg-glow" />

        <header>
          <span className="badge">⚽ Federació Catalana de Futbol</span>
          <h1>
            🧤 FCF <span className="accent">PORTERS</span> Top 20
          </h1>
          <p className="subtitle">
            Rànquing dels millors porters d&apos;una lliga · Dades oficials de fcf.cat
            (classificació + actes + fitxes individuals)
          </p>
        </header>

        <form onSubmit={onSubmit} className="card form-card">
          <label htmlFor="url">URL de la classificació de fcf.cat</label>
          <div className="input-row">
            <input
              id="url"
              type="text"
              placeholder="https://www.fcf.cat/classificacio/2526/futbol-11/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
            />
            <button type="submit" disabled={loading || !url.trim()}>
              {loading ? 'Analitzant…' : 'Generar Top 20 →'}
            </button>
          </div>
          <button
            type="button"
            className="link-btn"
            disabled={loading}
            onClick={() => {
              setUrl(EXAMPLE_URL);
              generate(EXAMPLE_URL);
            }}
          >
            📋 Exemple: Segona Catalana · Grup 1 · 25-26
          </button>
          <p className="hint">
            Format: <code>fcf.cat/classificacio/{'{temporada}'}/{'{esport}'}/{'{competicio}'}/{'{grup}'}</code>
          </p>
        </form>

        <section className="card explanation">
          <h2>Com es calcula la puntuació</h2>
          <div className="formula">
            <span className="term">
              Defensa de l&apos;equip <small>(gols encaixats / partit)</small>
            </span>
            <span className="op">+</span>
            <span className="term">
              % partits a porteria a 0 <small>(mostra d&apos;actes)</small>
            </span>
            <span className="op">+</span>
            <span className="term">
              Participació <small>(partits jugats / jornades)</small>
            </span>
            <span className="op">+</span>
            <span className="term">
              Titularitat <small>(titular / jugats)</small>
            </span>
          </div>
          <p className="explanation-text">
            Per a cada equip de la classificació, es llegeix el calendari complet i s&apos;analitza
            una mostra d&apos;actes oficials repartides al llarg de la temporada per identificar el
            jugador amb dorsal <strong>1</strong> (el porter titular) i comprovar quants d&apos;aquests
            partits l&apos;equip ha acabat amb la porteria a zero. Després es consulta la fitxa
            individual del porter per saber quants partits ha jugat i com a titular. Finalment es
            combina amb els gols encaixats totals de l&apos;equip (l&apos;indicador més fiable de
            quins equips encaixen menys) per obtenir una puntuació sobre 100.
          </p>
        </section>

        {(loading || Object.keys(stepStatus).length > 0) && (
          <section className="card steps">
            <div className="steps-row">
              {STEPS.map((s) => (
                <div key={s.id} className={`step ${stepStatus[s.id] || ''}`}>
                  <span className="step-num">{s.id}</span>
                  <span className="step-label">{s.label}</span>
                </div>
              ))}
            </div>
            {log && <p className="log">{log}</p>}
          </section>
        )}

        {error && (
          <section className="card error">
            <strong>Error:</strong> {error}
          </section>
        )}

        {results && (
          <section className="card results">
            <div className="results-header">
              <h2>
                🧤 Top {results.length} · Millors Porters
                {cached && <span className="cache-tag">⚡ caché</span>}
              </h2>
              <button type="button" className="print-btn" onClick={() => window.print()}>
                🖨️ Imprimir / PDF
              </button>
            </div>
            <div className="print-only print-header">
              <h1>🧤 FCF Porters · Top {results.length}</h1>
              <p>
                Rànquing dels millors porters · Dades de fcf.cat (classificació + actes +
                fitxes individuals)
              </p>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Porter</th>
                    <th>Equip</th>
                    <th title="Puntuació final sobre 100">⚡ Punts</th>
                    <th title="Gols encaixats per l'equip / partits jugats">GC/Partit</th>
                    <th title="Gols encaixats totals de l'equip">GC</th>
                    <th title="% de la mostra d'actes amb porteria a 0">% Porteria 0</th>
                    <th title="Partits jugats pel porter / jornades totals">PJ</th>
                    <th title="Partits com a titular">Titular</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={`${r.equip}-${r.porter}`}>
                      <td className="pos">{r.posicio}</td>
                      <td className="name">
                        {r.porterUrl ? (
                          <a href={r.porterUrl} target="_blank" rel="noreferrer">
                            {r.porter}
                          </a>
                        ) : (
                          r.porter
                        )}
                      </td>
                      <td className="team">
                        {r.escut && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.escut} alt="" className="badge-img" />
                        )}
                        {r.equip}
                      </td>
                      <td className="score">{r.puntuacio}</td>
                      <td>{r.golsContraPartit}</td>
                      <td>{r.golsContra}</td>
                      <td>{r.porteriaZeroMostra}%</td>
                      <td>
                        {r.jugats}/{r.jornadesTotals}
                      </td>
                      <td>{r.titular}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="footnote">
              El % de porteria a 0 es calcula sobre una mostra de fins a 4 actes per equip
              repartides al llarg de la temporada (no sobre tots els partits), per mantenir
              l&apos;anàlisi ràpida.
            </p>
          </section>
        )}

        <footer>
          FCF Porters Top 20 · Dades de{' '}
          <a href="https://www.fcf.cat" target="_blank" rel="noreferrer">
            fcf.cat
          </a>{' '}
          · Classificació + actes oficials + fitxes individuals
        </footer>
      </main>

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }
        html,
        body {
          padding: 0;
          margin: 0;
          font-family: 'Segoe UI', Roboto, -apple-system, BlinkMacSystemFont, sans-serif;
          background: #0b1220;
          color: #e6edf7;
        }
        a {
          color: #6fd3ff;
        }
        code {
          background: rgba(255, 255, 255, 0.08);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.85em;
        }
        @media print {
          html,
          body {
            background: #fff !important;
            color: #000 !important;
          }
        }
      `}</style>

      <style jsx>{`
        main {
          position: relative;
          max-width: 980px;
          margin: 0 auto;
          padding: 32px 18px 60px;
          overflow: hidden;
        }
        .bg-glow {
          position: fixed;
          inset: 0;
          z-index: -1;
          background: radial-gradient(
              circle at 20% -10%,
              rgba(34, 197, 94, 0.25),
              transparent 40%
            ),
            radial-gradient(circle at 90% 10%, rgba(59, 130, 246, 0.2), transparent 35%),
            #0b1220;
        }
        header {
          text-align: center;
          margin-bottom: 28px;
        }
        .badge {
          display: inline-block;
          font-size: 0.8rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: rgba(34, 197, 94, 0.15);
          border: 1px solid rgba(34, 197, 94, 0.4);
          color: #4ade80;
          padding: 4px 12px;
          border-radius: 999px;
          margin-bottom: 14px;
        }
        h1 {
          font-size: clamp(1.8rem, 5vw, 2.6rem);
          margin: 6px 0;
          letter-spacing: 0.04em;
        }
        .accent {
          color: #4ade80;
        }
        .subtitle {
          color: #9fb3c8;
          max-width: 620px;
          margin: 8px auto 0;
          line-height: 1.5;
          font-size: 0.95rem;
        }
        .card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 18px;
          backdrop-filter: blur(6px);
        }
        .form-card label {
          display: block;
          font-size: 0.85rem;
          color: #9fb3c8;
          margin-bottom: 8px;
        }
        .input-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        input[type='text'] {
          flex: 1 1 320px;
          background: #0f1a2e;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          padding: 12px 14px;
          color: #e6edf7;
          font-size: 0.95rem;
          outline: none;
        }
        input[type='text']:focus {
          border-color: #4ade80;
        }
        button[type='submit'] {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: #06210f;
          font-weight: 700;
          border: none;
          border-radius: 10px;
          padding: 12px 22px;
          cursor: pointer;
          font-size: 0.95rem;
          transition: opacity 0.2s;
        }
        button[type='submit']:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .link-btn {
          margin-top: 12px;
          background: none;
          border: none;
          color: #6fd3ff;
          cursor: pointer;
          font-size: 0.85rem;
          padding: 0;
        }
        .hint {
          margin-top: 12px;
          font-size: 0.8rem;
          color: #6e8299;
        }
        .explanation h2,
        .results h2 {
          margin-top: 0;
          font-size: 1.15rem;
        }
        .formula {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          margin: 14px 0;
        }
        .formula .term {
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 0.85rem;
          line-height: 1.3;
        }
        .formula .term small {
          display: block;
          color: #9fb3c8;
          font-size: 0.75rem;
        }
        .formula .op {
          color: #4ade80;
          font-weight: 700;
        }
        .explanation-text {
          color: #9fb3c8;
          font-size: 0.88rem;
          line-height: 1.6;
          margin: 0;
        }
        .steps-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: space-between;
        }
        .step {
          flex: 1 1 0;
          min-width: 100px;
          text-align: center;
          padding: 10px 6px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 0.8rem;
          color: #6e8299;
        }
        .step.active {
          border-color: #4ade80;
          color: #4ade80;
        }
        .step.done {
          border-color: rgba(74, 222, 128, 0.4);
          color: #b8f5cf;
          background: rgba(34, 197, 94, 0.08);
        }
        .step-num {
          display: block;
          font-weight: 700;
          font-size: 1rem;
        }
        .log {
          margin: 14px 0 0;
          font-size: 0.8rem;
          color: #9fb3c8;
          font-family: monospace;
          word-break: break-all;
        }
        .error {
          border-color: rgba(239, 68, 68, 0.4);
          color: #fecaca;
          background: rgba(239, 68, 68, 0.08);
        }
        .cache-tag {
          float: right;
          font-size: 0.75rem;
          color: #4ade80;
          font-weight: 400;
        }
        .table-wrap {
          overflow-x: auto;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
          min-width: 720px;
        }
        th,
        td {
          padding: 9px 10px;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          white-space: nowrap;
        }
        th {
          color: #9fb3c8;
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        td.pos {
          font-weight: 700;
          color: #4ade80;
        }
        td.score {
          font-weight: 700;
          color: #fff;
        }
        td.name a {
          color: #e6edf7;
          text-decoration: none;
        }
        td.name a:hover {
          color: #4ade80;
        }
        td.team {
          color: #9fb3c8;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .badge-img {
          width: 18px;
          height: 18px;
          object-fit: contain;
        }
        .footnote {
          margin: 14px 0 0;
          font-size: 0.78rem;
          color: #6e8299;
        }
        footer {
          text-align: center;
          color: #6e8299;
          font-size: 0.8rem;
          margin-top: 30px;
        }
        @media (max-width: 540px) {
          .steps-row {
            flex-wrap: wrap;
          }
          .step {
            flex: 1 1 30%;
          }
        }
        .results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 6px;
        }
        .results-header h2 {
          margin: 0;
        }
        .print-btn {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #e6edf7;
          border-radius: 8px;
          padding: 8px 14px;
          cursor: pointer;
          font-size: 0.85rem;
          white-space: nowrap;
          transition: border-color 0.2s, color 0.2s;
        }
        .print-btn:hover {
          border-color: #4ade80;
          color: #4ade80;
        }
        .print-only {
          display: none;
        }
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }
          .bg-glow {
            display: none !important;
          }
          header,
          .form-card,
          .explanation,
          .steps,
          .error,
          footer,
          .footnote,
          .cache-tag,
          .print-btn {
            display: none !important;
          }
          main {
            max-width: 100%;
            padding: 0;
            margin: 0;
          }
          .card.results {
            background: #fff;
            border: none;
            backdrop-filter: none;
            box-shadow: none;
            padding: 0;
            margin: 0;
          }
          .results-header {
            display: block;
          }
          .results h2 {
            display: none;
          }
          .print-only.print-header {
            display: block;
            text-align: center;
            margin-bottom: 10px;
          }
          .print-header h1 {
            font-size: 1.25rem;
            margin: 0 0 4px;
            color: #111;
          }
          .print-header p {
            font-size: 0.7rem;
            color: #444;
            margin: 0;
          }
          .table-wrap {
            overflow: visible;
          }
          table {
            width: 100%;
            min-width: 0;
            font-size: 8.5pt;
          }
          th,
          td {
            padding: 3px 5px;
            border-bottom: 1px solid #ddd;
            white-space: nowrap;
            color: #111;
          }
          th {
            color: #555;
          }
          td.pos {
            color: #16a34a;
            font-weight: 700;
          }
          td.score {
            color: #000;
            font-weight: 700;
          }
          td.name a {
            color: #111;
            text-decoration: none;
          }
          .badge-img {
            width: 14px;
            height: 14px;
          }
          tr {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </>
  );
}
