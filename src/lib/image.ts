export async function imageToDataUri(imageUrl: string): Promise<string | undefined> {
  if (!imageUrl) {
    return undefined;
  }

  const candidates = [imageUrl, makeImageProxyUrl(imageUrl)].filter((url): url is string => Boolean(url));

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "referer": "https://music.apple.com/",
        },
      });

      if (response.ok) {
        return responseToDataUri(response);
      }
    } catch {
      // Try the next candidate.
    }
  }

  return undefined;
}

async function responseToDataUri(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const buffer = await response.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);

  return `data:${contentType};base64,${base64}`;
}

function makeImageProxyUrl(imageUrl: string): string | undefined {
  try {
    const url = new URL(imageUrl);
    const source = encodeURIComponent(`${url.host}${url.pathname}`);

    return `https://wsrv.nl/?url=${source}&w=600&h=600&fit=cover&output=jpg`;
  } catch {
    return undefined;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}
