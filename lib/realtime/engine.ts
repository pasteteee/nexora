/**
 * Применение удалённых операций к странице по правилу last-write-wins.
 * Не зависит от транспорта и React: принимает операции, хранит последние известные
 * серверные версии объектов и при переподключении сверяет состояние с БД.
 */
import type { CanvasElement } from "@/lib/types";
import { sameContent, stamp } from "./lww";
import type { RemoteOp } from "./types";

export interface SyncTarget {
  /** Текущие объекты страницы в сторе */
  elements(): Record<string, CanvasElement>;
  /** Применить без истории отмены и без автосохранения */
  apply(p: { upsert: CanvasElement[]; remove: string[] }): void;
  /** У объекта есть несохранённая или сохраняемая локальная правка: она новее и победит */
  isPending(id: string): boolean;
  /** Все объекты с локальными правками: снимок перед загрузкой из БД */
  pendingIds(): Iterable<string>;
  /** Постоянное состояние страницы из БД */
  load(): Promise<CanvasElement[]>;
}

export class PageSync {
  private versions = new Map<string, number>();
  private tombstones = new Map<string, number>();
  private loading: Set<string> | null = null;
  private resyncRun: Promise<void> | null = null;
  private resyncAgain = false;

  constructor(private target: SyncTarget) {
    for (const e of Object.values(target.elements())) this.versions.set(e.id, stamp(e.updatedAt));
  }

  receive(ops: RemoteOp[]) {
    const upsert = new Map<string, CanvasElement>();
    const remove = new Set<string>();
    for (const op of ops) {
      const id = op.kind === "upsert" ? op.element.id : op.id;
      this.loading?.add(id);
      if (op.kind === "upsert") {
        const t = stamp(op.element.updatedAt);
        if ((this.tombstones.get(id) ?? -Infinity) >= t) continue;
        if ((this.versions.get(id) ?? -Infinity) > t) continue;
        this.versions.set(id, t);
        remove.delete(id);
        if (this.target.isPending(id)) continue;
        const local = this.target.elements()[id];
        if (local && sameContent(local, op.element)) { upsert.delete(id); continue; }
        upsert.set(id, op.element);
      } else {
        const t = stamp(op.at);
        if ((this.versions.get(id) ?? -Infinity) > t) continue;
        this.tombstones.set(id, t);
        this.versions.delete(id);
        upsert.delete(id);
        if (this.target.isPending(id)) continue;
        if (this.target.elements()[id]) remove.add(id);
      }
    }
    if (upsert.size || remove.size) this.target.apply({ upsert: [...upsert.values()], remove: [...remove] });
  }

  /** Дозагрузка после (пере)подключения: БД — источник истины (ТЗ 4.3.1.2) */
  resync(): Promise<void> {
    if (this.resyncRun) { this.resyncAgain = true; return this.resyncRun; }
    this.resyncRun = (async () => {
      try {
        do {
          this.resyncAgain = false;
          await this.reconcile();
        } while (this.resyncAgain);
      } finally {
        this.resyncRun = null;
      }
    })();
    return this.resyncRun;
  }

  private async reconcile() {
    // правки, которые сохранялись во время загрузки, могли не попасть в снимок БД
    const touched = new Set<string>(this.target.pendingIds());
    this.loading = touched;
    let server: CanvasElement[];
    try { server = await this.target.load(); } finally { this.loading = null; }
    const upsert: CanvasElement[] = [];
    const remove: string[] = [];
    const present = new Set<string>();
    const local = this.target.elements();
    for (const el of server) {
      present.add(el.id);
      // пока шла загрузка, могла прийти более новая версия
      if (touched.has(el.id)) continue;
      const t = stamp(el.updatedAt);
      this.versions.set(el.id, t);
      this.tombstones.delete(el.id);
      if (this.target.isPending(el.id)) continue;
      if (!local[el.id] || !sameContent(local[el.id], el)) upsert.push(el);
    }
    for (const id of Object.keys(local)) {
      if (present.has(id) || touched.has(id) || this.target.isPending(id)) continue;
      this.versions.delete(id);
      remove.push(id);
    }
    if (upsert.length || remove.length) this.target.apply({ upsert, remove });
  }
}
