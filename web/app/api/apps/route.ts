import { NextResponse } from "next/server";
import { listApplications } from "@/lib/apps-io";

/** Historial de aplicaciones generadas (Fase 7, sección "/aplicaciones"). */
export async function GET() {
  const applications = await listApplications();
  return NextResponse.json({ applications });
}
