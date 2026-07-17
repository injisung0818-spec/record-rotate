import { imageToDataUri } from "./image";
import type { Album, AlbumQuery, ITunesAlbumResult, ITunesArtistResult, ITunesSearchResponse } from "./types";
import { normalizeSearchText } from "./utils";

const ARTWORK_OVERRIDES: Record<string, string> = {
  [makeOverrideKey("ZUTOMAYO", "Cream")]: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/0a/3c/75/0a3c75bb-b239-e926-4ce0-7c26febd534a/25UMGIM62240.rgb.jpg/600x600bb.jpg",
  [makeOverrideKey("Mrs. GREEN APPLE", "ライラック")]: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/4c/3b/b2/4c3bb247-3be8-0c57-aa9a-7f1775a7b7a8/24UMGIM32931.rgb.jpg/600x600bb.jpg",
  [makeOverrideKey("Peppertones", "Beginner's Luck")]: "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/48/5c/b0/485cb05b-7a51-c0fa-fa6d-6196827a151f/cover_KM0015169_1.jpg/600x600bb.jpg",
  [makeOverrideKey("ZUTOMAYO", "沈香学")]: "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/94/5b/c5/945bc557-1eb6-bb02-900b-7a7b6e93aa9d/23UMGIM47498.rgb.jpg/600x600bb.jpg",
  [makeOverrideKey("Mrs. GREEN APPLE", "Ao to Natsu")]: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/7c/36/1a/7c361a6b-9f4c-8a77-0007-f548350c0e90/18UMGIM36633.rgb.jpg/600x600bb.jpg",
  [makeOverrideKey("음율", "행복론")]: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/84/f5/99/84f59915-1cee-243e-87f3-02b8e96834c2/8809933236348.jpg/600x600bb.jpg",
  [makeOverrideKey("Mrs. GREEN APPLE", "Summer Shadow")]: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/52/0e/26/520e26a9-4971-a144-1eea-fdbd8bfb0043/25UM1IM14224.rgb.jpg/600x600bb.jpg",
  [makeOverrideKey("BUMP OF CHICKEN", "ray")]: "https://is1-ssl.mzstatic.com/image/thumb/Music113/v4/a0/83/f4/a083f4f3-3853-d374-3870-957a7df3791a/TFCC-86457WW.jpg/600x600bb.jpg",
};

export async function resolveAlbum(query: AlbumQuery): Promise<Album> {
  const fallback = makeFallbackAlbum(query);
  const artworkOverride = getArtworkOverride(query);

  if (artworkOverride) {
    const imageDataUri = await imageToDataUri(artworkOverride);

    if (imageDataUri) {
      return {
        ...fallback,
        imageDataUri,
      };
    }
  }

  try {
    const album = query.artist && query.album
      ? await searchAlbumByArtistAndTitle(query)
      : await searchAlbum(query);

    if (!album) {
      return fallback;
    }

    return {
      ...album,
      imageDataUri: await imageToDataUri(album.imageDataUri ?? ""),
    };
  } catch {
    return fallback;
  }
}

async function searchAlbum(query: AlbumQuery): Promise<Album | null> {
  const params = new URLSearchParams({
    term: query.term,
    entity: "album",
    limit: "1",
  });

  const data = await fetchITunes<ITunesAlbumResult>(`https://itunes.apple.com/search?${params.toString()}`);
  const result = data.results[0];

  return albumFromResult(result, query.raw);
}

async function searchAlbumByArtistAndTitle(query: AlbumQuery): Promise<Album | null> {
  const artist = await findArtist(query.artist ?? "");
  if (artist?.artistId) {
    const lookupParams = new URLSearchParams({
      id: String(artist.artistId),
      entity: "album",
      limit: "100",
    });
    const lookup = await fetchITunes<ITunesAlbumResult | ITunesArtistResult>(`https://itunes.apple.com/lookup?${lookupParams.toString()}`);
    const result = pickBestAlbumResult(lookup.results.filter(isAlbumResult), query);

    if (result) {
      return albumFromResult(result, query.raw);
    }
  }

  return searchAlbum(query);
}

async function findArtist(artistName: string): Promise<ITunesArtistResult | undefined> {
  const params = new URLSearchParams({
    term: artistName,
    entity: "musicArtist",
    limit: "10",
  });
  const data = await fetchITunes<ITunesArtistResult>(`https://itunes.apple.com/search?${params.toString()}`);
  const normalizedArtist = normalizeSearchText(artistName);

  return data.results
    .map((artist) => ({
      artist,
      score: scoreArtistResult(artist, normalizedArtist),
    }))
    .sort((left, right) => right.score - left.score)[0]?.artist;
}

async function fetchITunes<T>(url: string): Promise<ITunesSearchResponse<T>> {
  const candidates = [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        headers: {
          accept: "application/json",
          "user-agent": "record-rotate/0.1",
        },
      });

      if (!response.ok) {
        throw new Error(`iTunes request failed: ${response.status}`);
      }

      const text = await response.text();

      return JSON.parse(text) as ITunesSearchResponse<T>;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function albumFromResult(result: ITunesAlbumResult | undefined, query: string): Album | null {
  if (!result?.collectionName || !result.artistName || !result.artworkUrl100) {
    return null;
  }

  return {
    query,
    title: result.collectionName,
    artist: result.artistName,
    imageDataUri: upgradeArtworkUrl(result.artworkUrl100),
  };
}

function pickBestAlbumResult(results: ITunesAlbumResult[], query: AlbumQuery): ITunesAlbumResult | undefined {
  if (!query.artist || !query.album) {
    return results[0];
  }

  const normalizedArtist = normalizeSearchText(query.artist);
  const normalizedAlbum = normalizeSearchText(query.album);

  return results
    .map((result) => ({
      result,
      score: scoreAlbumResult(result, normalizedArtist, normalizedAlbum),
    }))
    .sort((left, right) => right.score - left.score)[0]?.result;
}

function scoreArtistResult(result: ITunesArtistResult, artist: string): number {
  const resultArtist = normalizeSearchText(result.artistName ?? "");
  let score = 0;

  if (resultArtist === artist) score += 100;
  if (resultArtist.includes(artist) || artist.includes(resultArtist)) score += 50;

  return score;
}

function scoreAlbumResult(result: ITunesAlbumResult, artist: string, album: string): number {
  const resultArtist = normalizeSearchText(result.artistName ?? "");
  const resultAlbum = normalizeSearchText(result.collectionName ?? "");
  let score = 0;

  if (resultAlbum === album) score += 100;
  if (resultAlbum.includes(album) || album.includes(resultAlbum)) score += 45;
  if (resultArtist === artist) score += 80;
  if (resultArtist.includes(artist) || artist.includes(resultArtist)) score += 35;

  return score;
}

function isAlbumResult(result: ITunesAlbumResult | ITunesArtistResult): result is ITunesAlbumResult {
  return "collectionName" in result;
}

function upgradeArtworkUrl(url: string): string {
  return url.replace(/\/100x100bb\.(jpg|png|webp)$/i, "/600x600bb.$1");
}

function getArtworkOverride(query: AlbumQuery): string | undefined {
  if (!query.artist || !query.album) {
    return undefined;
  }

  return ARTWORK_OVERRIDES[makeOverrideKey(query.artist, query.album)];
}

function makeOverrideKey(artist: string, album: string): string {
  return `${normalizeOverridePart(artist)}::${normalizeOverridePart(album)}`;
}

function normalizeOverridePart(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function makeFallbackAlbum(query: AlbumQuery): Album {
  return {
    query: query.raw,
    artist: query.fallbackArtist,
    title: query.fallbackTitle,
  };
}
