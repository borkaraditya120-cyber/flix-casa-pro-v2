import type { MovieItem } from "@/types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const POSTER_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const BACKDROP_IMAGE_BASE = "https://image.tmdb.org/t/p/original";
const DEFAULT_CATALOG = { pages: 5, region: "US", language: "en-US", indianLanguage: "hi-IN" };

function getApiKey(): string | null {
  return process.env.NEXT_PUBLIC_TMDB_API_KEY || process.env.TMDB_API_KEY || null;
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = getApiKey();
  if (!key) throw new Error("TMDB API key is not configured");
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", key);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchPages(path: string, params: Record<string, string> = {}, pages: number[] = [1, 2, 3]) {
  try {
    const pageCount = Math.max(1, Math.min(10, DEFAULT_CATALOG.pages));
    const selectedPages = pages.length ? pages.slice(0, pageCount) : Array.from({ length: pageCount }, (_, index) => index + 1);
    const responses = await Promise.all(
      selectedPages.map((page) => tmdbFetch<{ results: TmdbMovie[] }>(path, { ...params, page: String(page) }))
    );
    const combined = responses.flatMap((data) => data.results || []);
    const unique = new Map<number, TmdbMovie>();
    for (const item of combined) {
      if (!item.poster_path) continue;
      if (!unique.has(item.id)) unique.set(item.id, item);
    }
    return Array.from(unique.values());
  } catch (error) {
    console.error("TMDB list request failed:", error instanceof Error ? error.message : "Unknown error");
    return [];
  }
}

interface TmdbMovie {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genre_ids?: number[];
  origin_country?: string[];
  original_language?: string;
  media_type?: "movie" | "tv";
}

function mapMovie(item: TmdbMovie, mediaType: "movie" | "tv" = "movie"): MovieItem {
  const titleCandidates = [item.title, item.name, item.original_title, item.original_name];
  const englishTitle = titleCandidates.find((value) => typeof value === "string" && /^[\x00-\x7F]+$/.test(value.trim()) && value.trim().length > 0) || "Unknown";
  return {
    id: item.id,
    title: englishTitle,
    overview: item.overview || "",
    posterPath: item.poster_path ? `${POSTER_IMAGE_BASE}${item.poster_path}` : null,
    backdropPath: item.backdrop_path ? `${BACKDROP_IMAGE_BASE}${item.backdrop_path}` : null,
    releaseDate: item.release_date || item.first_air_date || "",
    voteAverage: item.vote_average,
    genreIds: item.genre_ids || [],
    originCountry: item.origin_country || [],
    originalLanguage: item.original_language,
    mediaType: item.media_type || mediaType,
  };
}

export async function getTrendingIndia(): Promise<MovieItem[]> {
  const [trending, indian] = await Promise.all([
    fetchPages("/trending/movie/week", { region: "IN", language: "en-US" }, [1, 2, 3, 4, 5]),
    fetchPages("/discover/movie", {
      region: "IN",
      language: "en-US",
      with_original_language: "hi",
      sort_by: "popularity.desc",
    }, [1, 2, 3, 4, 5]),
  ]);
  return [...indian, ...trending].map((m) => mapMovie(m));
}

export async function getTrendingTv(): Promise<MovieItem[]> {
  const shows = await fetchPages("/trending/tv/week", { language: "en-US" }, [1, 2, 3]);
  return shows.map((show) => mapMovie(show, "tv"));
}

export async function getGlobalTop(): Promise<MovieItem[]> {
  const movies = await fetchPages("/movie/popular", { region: DEFAULT_CATALOG.region, language: DEFAULT_CATALOG.language }, [1, 2, 3, 4, 5]);
  return movies.map((m) => mapMovie(m));
}

export async function getByGenre(genreId: number, region = "US", category = ""): Promise<MovieItem[]> {
  const isIndian = category === "Indian Movies (Bollywood / South Hindi)" || category === "Indian Horror";
  const movies = await fetchPages("/discover/movie", {
    with_genres: String(genreId),
    region: isIndian ? "IN" : DEFAULT_CATALOG.region || region,
    language: isIndian ? "en-US" : DEFAULT_CATALOG.language,
    ...(isIndian ? { with_original_language: "hi" } : {}),
    sort_by: "popularity.desc",
    "vote_average.gte": "6",
  }, [1, 2, 3, 4, 5]);

  return movies.map((m) => mapMovie(m));
}

export async function searchMovies(query: string): Promise<MovieItem[]> {
  const data = await tmdbFetch<{ results: TmdbMovie[] }>("/search/multi", { query });
  return data.results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv" || !r.media_type)
    .map((m) => mapMovie(m, m.media_type === "tv" ? "tv" : "movie"));
}

export async function getMovieDetails(id: number, mediaType: "movie" | "tv" = "movie"): Promise<MovieItem> {
  const data = await tmdbFetch<TmdbMovie & { genres: { id: number }[] }>(`/${mediaType}/${id}`, { language: "en-US" });
  return {
    ...mapMovie(data, mediaType),
    genreIds: data.genres?.map((g) => g.id) || [],
  };
}

export async function getMovieTrailer(id: number, mediaType: "movie" | "tv" = "movie"): Promise<string | null> {
  const data = await tmdbFetch<{ results: { key: string; site: string; type: string; official?: boolean }[] }>(`/${mediaType}/${id}/videos`, { language: "en-US" });
  const trailer = data.results.find((video) => video.site === "YouTube" && video.type === "Trailer" && video.official === true);
  return trailer?.key || null;
}

export async function getUpcomingMovies(): Promise<MovieItem[]> {
  const movies = await fetchPages("/movie/upcoming", { region: "IN", language: "en-US" }, [1, 2]);
  return movies.map((movie) => mapMovie(movie));
}

export async function getKidsContent(): Promise<MovieItem[]> {
  const data = await tmdbFetch<{ results: TmdbMovie[] }>("/discover/movie", {
    certification_country: "US",
    certification: "G",
    with_genres: "16",
    sort_by: "popularity.desc",
  });
  return data.results.map((m) => mapMovie(m));
}

export const GENRE_ROWS = [
  { id: "indian", title: "Indian Movies (Bollywood / South Hindi)", genreId: 28 },
  { id: "indian-horror", title: "Indian Horror", genreId: 27 },
  { id: "hollywood-horror", title: "Normal / Hollywood Horror", genreId: 27 },
  { id: "action", title: "Action", genreId: 28 },
  { id: "adventure", title: "Adventure", genreId: 12 },
  { id: "animation", title: "Animation", genreId: 16 },
  { id: "comedy", title: "Comedy", genreId: 35 },
  { id: "scifi", title: "Sci-Fi", genreId: 878 },
  { id: "horror", title: "Horror", genreId: 27 },
  { id: "romance", title: "Romance", genreId: 10749 },
];

export const KIDS_BLOCKED_GENRES = [27, 53, 80, 10752];
