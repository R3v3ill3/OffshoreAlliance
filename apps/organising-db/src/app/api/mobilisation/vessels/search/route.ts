import { NextResponse } from "next/server";
import { createAisProvider, readAisEnv } from "@/lib/mobilisation/ais";
import { isResponse, requireUser } from "@/lib/mobilisation/pipeline/session";

export const dynamic = "force-dynamic";

/** Name search against the configured AIS provider. The key stays on the server. */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  if (auth.role !== "admin" && auth.role !== "user") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const name = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (name.length < 3) return NextResponse.json({ results: [], warning: "Enter at least 3 characters." });
  const env = readAisEnv();
  const provider = createAisProvider(env);
  if (!provider) {
    return NextResponse.json({
      results: [],
      warning: env.apiKey
        ? `Provider "${env.provider}" is not implemented. Set AIS_PROVIDER=datalastic.`
        : "Live name search needs DATALASTIC_API_KEY. You can still add a vessel by IMO.",
    });
  }
  try {
    const results = await provider.searchByName(name);
    return NextResponse.json({ results: results.slice(0, 15) });
  } catch (error) {
    return NextResponse.json(
      { results: [], warning: error instanceof Error ? error.message : "AIS search failed" },
      { status: 502 }
    );
  }
}
