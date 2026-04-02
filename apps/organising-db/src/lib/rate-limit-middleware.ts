/**
 * Rate Limiting Middleware
 *
 * Usage example in API routes:
 *
 * import { checkRateLimit, logRateLimitRequest } from "@/lib/rate-limit-middleware";
 *
 * export async function POST(req: NextRequest) {
 *   // Check rate limit
 *   const rateLimitResult = await checkRateLimit(req);
 *   if (!rateLimitResult.allowed) {
 *     return NextResponse.json(
 *       { error: rateLimitResult.reason },
 *       { status: 429, headers: rateLimitResult.headers }
 *     );
 *   }
 *
 *   // ... handle request ...
 *
 *   // Log the request after processing
 *   await logRateLimitRequest(req, response.status);
 * }
 */

import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export interface RateLimitResult {
  allowed: boolean;
  limit?: number;
  remaining?: number;
  resetAt?: number;
  reason?: string;
  window?: string;
  headers?: HeadersInit;
}

/**
 * Check if the current user is rate limited
 */
export async function checkRateLimit(
  req: NextRequest,
  endpoint?: string
): Promise<RateLimitResult> {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // If no user, allow (rate limiting only applies to authenticated users)
    if (authError || !user) {
      return {
        allowed: true,
      };
    }

    // Check rate limit
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_endpoint: endpoint ?? req.nextUrl.pathname,
    });

    if (error) {
      console.error("Error checking rate limit:", error);
      // On error, allow the request (fail open)
      return {
        allowed: true,
      };
    }

    const result = data as any;

    // Build rate limit headers
    const headers: Record<string, string> = {};

    if (result.limit) {
      headers["X-RateLimit-Limit"] = result.limit.toString();
      headers["X-RateLimit-Remaining"] = result.remaining?.toString() ?? "0";
      headers["X-RateLimit-Reset"] = result.resetAt?.toString() ?? "";
    }

    if (result.remaining_per_minute !== null) {
      headers["X-RateLimit-Remaining-Minute"] = result.remaining_per_minute.toString();
    }
    if (result.remaining_per_hour !== null) {
      headers["X-RateLimit-Remaining-Hour"] = result.remaining_per_hour.toString();
    }
    if (result.remaining_per_day !== null) {
      headers["X-RateLimit-Remaining-Day"] = result.remaining_per_day.toString();
    }

    return {
      allowed: result.allowed,
      limit: result.limit,
      remaining: result.remaining,
      resetAt: result.resetAt,
      reason: result.reason,
      window: result.window,
      headers,
    };
  } catch (error) {
    console.error("Error in checkRateLimit:", error);
    // Fail open - allow the request if rate limiting fails
    return {
      allowed: true,
    };
  }
}

/**
 * Log a request for rate limiting purposes
 */
export async function logRateLimitRequest(
  req: NextRequest,
  statusCode: number,
  endpoint?: string
): Promise<void> {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // Only log authenticated requests
    if (authError || !user) {
      return;
    }

    // Get client info
    const ip_address = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;
    const user_agent = req.headers.get("user-agent") ?? null;

    await supabase.rpc("log_rate_limit_request", {
      p_user_id: user.id,
      p_endpoint: endpoint ?? req.nextUrl.pathname,
      p_method: req.method,
      p_status_code: statusCode,
      p_ip_address: ip_address,
      p_user_agent: user_agent,
      p_request_path: req.nextUrl.pathname + req.nextUrl.search,
    });
  } catch (error) {
    console.error("Error in logRateLimitRequest:", error);
    // Don't throw - logging failures shouldn't break requests
  }
}

/**
 * Middleware helper that combines check and log
 *
 * Usage:
 * const { rateLimitResult, response } = await withRateLimit(req);
 * if (response) return response;
 * // ... handle request ...
 * await logRateLimitRequest(req, 200);
 */
export async function withRateLimit(req: NextRequest, endpoint?: string) {
  const rateLimitResult = await checkRateLimit(req, endpoint);

  if (!rateLimitResult.allowed) {
    return {
      rateLimitResult,
      response: new Response(
        JSON.stringify({ error: rateLimitResult.reason ?? "Rate limit exceeded" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            ...rateLimitResult.headers,
            "Retry-After": String(
              rateLimitResult.resetAt != null
                ? Math.max(
                    0,
                    Math.ceil(rateLimitResult.resetAt - Date.now() / 1000)
                  )
                : 60
            ),
          },
        }
      ),
    };
  }

  return { rateLimitResult };
}
