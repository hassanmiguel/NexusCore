import { useEffect, useMemo, useRef, useState } from "react";

const NODE_COLORS = {
  doc: "#ff4d6d",
  mem: "#7c5cff",
  skill: "#00d4ff"
};

function terms(text) {
  return new Set(String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 3));
}

function buildGraph(docs, mems) {
  const nodes = [];
  const edges = [];
  (docs || []).forEach((doc, i) => {
    nodes.push({ id: `doc:${doc.id}`, label: doc.name || `Doc ${i + 1}`, type: "doc", weight: doc.chunkCount || 1 });
  });
  (mems || []).forEach((mem, i) => {
    nodes.push({ id: `mem:${mem.id}`, label: String(mem.text || "").slice(0, 28), type: "mem", weight: 1 });
  });

  // Edges by shared terms.
  const docTerms = new Map();
  nodes.forEach(n => {
    const source = n.type === "doc"
      ? (docs.find(d => `doc:${d.id}` === n.id)?.name || "")
      : (mems.find(m => `mem:${m.id}` === n.id)?.text || "");
    docTerms.set(n.id, terms(source));
  });
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i], b = nodes[j];
      const ta = docTerms.get(a.id), tb = docTerms.get(b.id);
      let overlap = 0;
      ta.forEach(t => { if (tb.has(t)) overlap += 1; });
      if (overlap >= 2) edges.push({ from: a.id, to: b.id, weight: overlap });
    }
  }
  return { nodes, edges };
}

function layout(nodes, width, height) {
  const cx = width / 2, cy = height / 2;
  const radius = Math.min(width, height) / 2 - 40;
  const grouped = { doc: [], mem: [], skill: [] };
  nodes.forEach(n => (grouped[n.type] || (grouped[n.type] = [])).push(n));
  const positions = new Map();
  let angleOffset = 0;
  Object.keys(grouped).forEach(type => {
    const group = grouped[type];
    const r = radius * (type === "doc" ? 0.95 : 0.6);
    group.forEach((n, i) => {
      const angle = (i / Math.max(1, group.length)) * Math.PI * 2 + angleOffset;
      positions.set(n.id, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    });
    angleOffset += 0.7;
  });
  return positions;
}

export default function KnowledgeGraph({ wormgpt }) {
  const [docs, setDocs] = useState([]);
  const [mems, setMems] = useState([]);
  const [hover, setHover] = useState(null);
  const [loading, setLoading] = useState(true);
  const svgRef = useRef(null);
  const [size, setSize] = useState({ w: 640, h: 420 });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [d, m] = await Promise.all([
          wormgpt?.knowledgeDocuments?.() || [],
          wormgpt?.memoryList?.({}) || []
        ]);
        if (cancelled) return;
        setDocs(Array.isArray(d) ? d : []);
        setMems(Array.isArray(m) ? m : []);
      } catch (err) {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [wormgpt]);

  useEffect(() => {
    function resize() {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        setSize({ w: Math.max(320, rect.width || 640), h: 420 });
      }
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const { nodes, edges } = useMemo(() => buildGraph(docs, mems), [docs, mems]);
  const positions = useMemo(() => layout(nodes, size.w, size.h), [nodes, size.w, size.h]);

  if (loading) return <div className="control-center__kv">Loading knowledge graph…</div>;
  if (nodes.length === 0) return <div className="control-center__kv">No knowledge or memory nodes yet. Ingest documents or save memories to populate the graph.</div>;

  return (
    <div className="control-center__body">
      <div className="skills-panel__card-title">Knowledge Graph</div>
      <div className="control-center__kv control-center__note">
        Nodes: {nodes.length} · Edges: {edges.length} (linked by shared terms)
      </div>
      <div ref={svgRef} className="kg-wrap" style={{ width: "100%", height: "420px", position: "relative", overflow: "hidden", borderRadius: "12px", background: "radial-gradient(circle at 50% 50%, #1a0a1f 0%, #05020a 100%)" }}>
        <svg width={size.w} height={size.h} style={{ display: "block" }}>
          <defs>
            <filter id="kg-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="kg-edge" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ff4d6d" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#7c5cff" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          {edges.map((e, i) => {
            const a = positions.get(e.from), b = positions.get(e.to);
            if (!a || !b) return null;
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="url(#kg-edge)" strokeWidth={Math.min(3, 0.5 + e.weight * 0.4)} opacity="0.7" />;
          })}
          {nodes.map(n => {
            const p = positions.get(n.id);
            if (!p) return null;
            const r = 6 + Math.min(12, n.weight * 2);
            const color = NODE_COLORS[n.type] || "#ffffff";
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                <circle r={r + 6} fill={color} opacity="0.15" filter="url(#kg-glow)" />
                <circle r={r} fill={color} stroke="#ffffff" strokeWidth="1.2" filter="url(#kg-glow)" />
                <text y={r + 14} textAnchor="middle" fontSize="10" fill="#e0d0d8" style={{ pointerEvents: "none" }}>
                  {n.label.length > 18 ? n.label.slice(0, 18) + "…" : n.label}
                </text>
              </g>
            );
          })}
        </svg>
        {hover && (
          <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(10,4,12,0.85)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "8px 10px", color: "#f0e0e8", fontSize: 12, maxWidth: 260 }}>
            <strong style={{ color: NODE_COLORS[hover.type] }}>{hover.type.toUpperCase()}</strong>
            <div style={{ marginTop: 4 }}>{hover.label}</div>
            <div style={{ opacity: 0.6, marginTop: 2 }}>weight: {hover.weight}</div>
          </div>
        )}
      </div>
      <style>{`
        .kg-wrap svg text { font-family: system-ui, sans-serif; }
      `}</style>
    </div>
  );
}