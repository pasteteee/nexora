import s from "./notebooks.module.css";

const NOTES = ["--note-yellow", "--note-pink", "--note-green", "--note-blue", "--note-violet"];

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Обложка тетради: детерминированная «мини-доска» из стикеров по id */
export function Cover({ id }: { id: string }) {
  const h = hash(id);
  const pick = (n: number) => `var(${NOTES[(h >> (n * 3)) % NOTES.length]})`;
  const base = ((h >> 4) % 360);
  return (
    <div className={s.cover} style={{ background: `linear-gradient(160deg, hsl(${base} 70% 93%), hsl(${(base + 50) % 360} 65% 86%))` }}>
      <i style={{ left: `${10 + (h % 12)}%`, top: "22%", width: "34%", height: "38%", background: pick(1), rotate: `${(h % 7) - 3}deg` }} />
      <i style={{ left: `${52 + (h % 9)}%`, top: `${14 + (h % 10)}%`, width: "26%", height: "30%", background: pick(2), rotate: `${((h >> 3) % 7) - 3}deg` }} />
      <i style={{ left: `${40 + (h % 8)}%`, top: "58%", width: "22%", height: "26%", background: pick(3), borderRadius: "50%" }} />
    </div>
  );
}
