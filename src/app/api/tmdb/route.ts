import { NextRequest, NextResponse } from "next/server";
import { getTrendingIndia, getTrendingTv, getGlobalTop, getByGenre, searchMovies, getKidsContent, getMovieDetails, getMovieTrailer, getUpcomingMovies, GENRE_ROWS } from "@/lib/tmdb";
import { sanitizeSearchQuery } from "@/lib/sanitize";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = rateLimit(ip, "tmdb");
  if (!allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const query = searchParams.get("q");
  const id = searchParams.get("id");
  const mediaType = searchParams.get("mediaType") === "tv" ? "tv" : "movie";
  const genreId = searchParams.get("genreId");
  const category = searchParams.get("category");
  const kids = searchParams.get("kids");

  try {
    if (id && /^\d+$/.test(id)) {
      if (type === "videos") {
        return NextResponse.json({ trailerKey: await getMovieTrailer(Number(id), mediaType) });
      }
      const result = await getMovieDetails(Number(id), type === "tv" ? "tv" : "movie");
      return NextResponse.json({ result });
    }

    if (query) {
      const results = await searchMovies(sanitizeSearchQuery(query));
      return NextResponse.json({ results });
    }

    if (kids === "true") {
      const results = await getKidsContent();
      return NextResponse.json({ results });
    }

    if (genreId) {
      const results = await getByGenre(parseInt(genreId), category === "Indian Movies (Bollywood / South Hindi)" || category === "Indian Horror" ? "IN" : "US", category || "");
      return NextResponse.json({ results });
    }

    switch (type) {
      case "trending-india":
        return NextResponse.json({ results: await getTrendingIndia() });
      case "global-top":
        return NextResponse.json({ results: await getGlobalTop() });
      case "trending-tv":
        return NextResponse.json({ results: await getTrendingTv() });
      case "upcoming":
        return NextResponse.json({ results: await getUpcomingMovies() });
      case "genres":
        return NextResponse.json({ genres: GENRE_ROWS });
      default:
        return NextResponse.json({
          trending: await getTrendingIndia(),
          global: await getGlobalTop(),
          upcoming: await getUpcomingMovies(),
          tv: await getTrendingTv(),
          genres: GENRE_ROWS,
        });
    }
  } catch {
    return NextResponse.json({ error: "Failed to fetch content", results: [] }, { status: 500 });
  }
}
