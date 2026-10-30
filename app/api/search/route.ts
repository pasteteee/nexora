import { failure, HttpError } from "@/lib/knowledge/server";
import { search } from "@/lib/knowledge/search";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams; const q = params.get("q")?.trim();
    if (!q || q.length>2000) throw new HttpError(400,"Введите запрос длиной до 2000 символов");
    return Response.json({results:await search(params.get("workspaceId") || "",q,request.signal)});
  } catch(error) {return failure(error);}
}
