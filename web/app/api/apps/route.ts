import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getStorageAdapter } from "@/lib/storage/get-storage-adapter";

/** Historial de aplicaciones generadas (Fase 7, sección "/aplicaciones"). */
export async function GET() {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const applications = await getStorageAdapter(session.userId).listApplications();
  return NextResponse.json({ applications });
}
