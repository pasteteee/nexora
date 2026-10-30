import { after } from "next/server";
import { access, admin, failure, HttpError, uuid } from "@/lib/knowledge/server";
import { processSource } from "@/lib/knowledge/process";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(_request: Request,{params}:{params:Promise<{sourceId:string}>}) {
  try {
    const {sourceId} = await params;
    if (!uuid(sourceId)) throw new HttpError(400,"Неверный материал");
    const sb = await (await import("@/lib/supabase/server")).supabaseServer();
    const {data:source} = await sb.from("sources").select("workspace_id").eq("id",sourceId).single();
    if (!source) throw new HttpError(404,"Материал не найден");
    const {user} = await access(source.workspace_id,true);
    const worker = admin();
    const {data,error} = await worker.from("sources").update({status:"processing",error_message:null}).eq("id",sourceId).or(`status.neq.processing,updated_at.lt.${new Date(Date.now()-310000).toISOString()}`).select("id").maybeSingle();
    if (error) throw error;
    if (data) after(()=>processSource(sourceId,user.id));
    return Response.json({status:"processing"},{status:202});
  } catch(error) {return failure(error);}
}
