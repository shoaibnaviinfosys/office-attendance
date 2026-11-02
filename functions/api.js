function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders()
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

export async function onRequestPost({ request, env }) {
  const endpoint = env.GAS_WEB_APP_URL;

  if (!endpoint) {
    return json({
      ok: false,
      error: "Backend URL is not configured in Cloudflare Pages."
    }, 500);
  }

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
      redirect: "follow"
    });

    const body = await upstream.text();

    return new Response(body, {
      status: upstream.ok ? 200 : upstream.status,
      headers: corsHeaders()
    });
  } catch (error) {
    return json({
      ok: false,
      error: "Could not reach attendance backend. Check the Apps Script deployment URL."
    }, 502);
  }
}
