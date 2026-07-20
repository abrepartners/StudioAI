import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

process.env.REPLICATE_API_TOKEN = "r8_dummy";
process.env.SESSION_SECRET = "test_secret_at_least_32_chars_long_ok";
process.env.VITE_GOOGLE_CLIENT_ID = "test-client-id";
process.env.AUTH_ENFORCE = "enforce";

const handler = (await import("../../api/lab-run")).default;

function makeRes() {
  const res: any = { _status: 0, _body: "", _headers: {} };
  res.status = (s: number) => {
    res._status = s;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res._headers[k] = v;
    return res;
  };
  res.send = (b: string) => {
    res._body = b;
    return res;
  };
  res.end = () => res;
  return res;
}

async function signedCookieFor(email: string): Promise<string> {
  const { signSession } = await import("../../api/_lib/session");
  return `studioai_session=${await signSession({ email, sub: `sub-${email}` })}`;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("lab-run is admin-only", () => {
  it("refuses an ordinary signed-in user with 403", async () => {
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: { cookie: await signedCookieFor("freeuser@gmail.com") },
        body: { modelSlug: "some/expensive-video-model", input: {} },
      },
      res,
    );
    expect(res._status).toBe(403);
  });

  it("allows an admin", async () => {
    const res = makeRes();
    await handler(
      {
        method: "POST",
        headers: { cookie: await signedCookieFor("book@averyandbryant.com") },
        body: { modelSlug: "", input: {} }, // empty slug: fails validation, not auth
      },
      res,
    );
    expect(res._status).toBe(400); // got past the auth gate
  });
});
