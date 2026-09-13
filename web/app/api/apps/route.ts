import { NextResponse } from "next/server";
import { getStorageAdapter } from "@/lib/storage/get-storage-adapter";

/** Historial de aplicaciones generadas (Fase 7, sección "/aplicaciones"). */
export async function GET() {
  const applications = await getStorageAdapter().listApplications();
  return NextResponse.json({ applications });
}
