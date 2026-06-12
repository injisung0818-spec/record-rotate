const response = await fetch(imageUrl, {
  headers: {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "referer": "https://music.apple.com/",
  },
});
export async function imageToDataUri(imageUrl: string): Promise<string | undefined> {
  if (!imageUrl) {
    return undefined;
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    return undefined;
  }

  const contentType = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const buffer = await response.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);

  return `data:${contentType};base64,${base64}`;
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
