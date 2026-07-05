import { TESTPAD_CONTRACT } from "@hack-raise/graph-core/fixtures";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const contract = {
    ...TESTPAD_CONTRACT,
    baseUrl: `${url.protocol}//${url.host}`,
  };

  return Response.json(contract, {
    headers: { "Cache-Control": "no-store" },
  });
}
