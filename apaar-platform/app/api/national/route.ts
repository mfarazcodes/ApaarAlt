import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/guard";
import { HttpError, jsonError, parseWith } from "@/lib/http";
import { nationalColleges, studentsFor } from "@/lib/nationalData";
import { SAMPLE_COLLEGES } from "@/lib/nadSyncEngine";

const Query = z.object({
  college: z.string().max(20).optional(),
  programme: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
});

/**
 * The national drill-down. Everyone with access sees colleges and their programmes. Only the AICTE officer sees the
 * pseudonymous student rows, and only as tokens: no names and no ID numbers.
 */
export async function GET(req: Request) {
  try {
    const { session } = await guard(req, { roles: ["AICTE", "REGISTRAR"], scope: "national" });
    const q = parseWith(Query, Object.fromEntries(new URL(req.url).searchParams));

    if (q.college || q.programme) {
      if (session!.role !== "AICTE") throw new HttpError(403, "Student-level rows are for the AICTE officer only.");
      if (!q.college || !q.programme) throw new HttpError(400, "Give both a college and a programme.");
      if (!SAMPLE_COLLEGES.some((c) => c.code === q.college)) throw new HttpError(404, "Unknown college.");
      try {
        return NextResponse.json({ success: true, ...studentsFor(q.college, q.programme, q.page ?? 1) });
      } catch {
        throw new HttpError(404, "Unknown programme.");
      }
    }
    return NextResponse.json({ success: true, colleges: nationalColleges(), studentLevel: session!.role === "AICTE" });
  } catch (err) {
    return jsonError(err, "Failed to load the national view");
  }
}
