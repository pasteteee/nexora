import { beforeEach, describe, expect, it, vi } from "vitest";
import "./setup-storage";
const api = vi.hoisted(() => ({ uploadImage: vi.fn(), uploadSource: vi.fn(), listElements: vi.fn(), upsertElements: vi.fn(), deleteElements: vi.fn() }));
vi.mock("@/lib/data", () => ({ data: api }));
vi.mock("@/components/ui", () => ({ toast: vi.fn() }));
import { useEditor } from "@/lib/editor/store";
import { useUi } from "@/lib/editor/ui";
import { insertImages, insertSources } from "@/lib/editor/actions";
import { resetAutosave } from "@/lib/editor/autosave";

function open(canvasId: string) { useEditor.getState().init({ canvasId, canEdit: true, els: [], background: { type: "plain", spacing: 24 } }); }
beforeEach(() => { vi.resetAllMocks(); resetAutosave(); open("original"); useUi.setState({ workspaceId: "workspace" }); api.listElements.mockResolvedValue([]); api.upsertElements.mockResolvedValue(undefined); });
describe("uploads finishing after navigation", () => {
  it("persists an image to the original page without adding it to the new page", async () => {
    let finish!: (value: unknown) => void;
    api.uploadImage.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const pending = insertImages([new File(["image"], "picture.png", { type: "image/png" })], { x: 0, y: 0 });
    open("destination");
    finish({ path: "image.png", naturalWidth: 200, naturalHeight: 100 });
    await pending;
    expect(api.upsertElements.mock.calls[0][0][0]).toMatchObject({ canvasId: "original", type: "image" });
    expect(Object.values(useEditor.getState().els)).toHaveLength(0);
  });
  it("keeps a document reference on the page where its upload began", async () => {
    let finish!: (value: unknown) => void;
    api.uploadSource.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const pending = insertSources([new File(["notes"], "notes.md", { type: "text/markdown" })], { x: 0, y: 0 });
    open("destination");
    finish({ id: "source", originalName: "notes.md", mimeType: "text/markdown", status: "pending", size: 5 });
    await pending;
    expect(api.upsertElements.mock.calls[0][0][0]).toMatchObject({ canvasId: "original", sourceId: "source" });
    expect(Object.values(useEditor.getState().els)).toHaveLength(0);
  });
});
