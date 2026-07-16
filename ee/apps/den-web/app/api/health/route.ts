import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { ok: true, service: "den-web" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
