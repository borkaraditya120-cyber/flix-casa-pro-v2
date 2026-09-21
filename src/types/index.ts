export interface GoogleAccount {
  id: string;
  email: string;
  name: string;
  picture?: string;
  isOnline: boolean;
  lastSeen: string;
  isBlocked: boolean;
  isRootAdmin: boolean;
}

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  isKids: boolean;
  accountId: string;
  createdAt: string;
  contentRating?: "all" | "18+" | "16+" | "13+" | "10+";
}

export interface MovieItem {
  id: number;
  title: string;
  description?: string;
  overview?: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string;
  voteAverage: number;
  genreIds: number[];
  originCountry?: string[];
  originalLanguage?: string;
  mediaType: "movie" | "tv";
  contentRating?: "10+" | "13+" | "16+" | "18+";
}

export interface TorrentResult {
  title: string;
  magnet: string;
  seeders: number;
  size: string;
  quality: "1080p" | "720p" | "480p" | "unknown";
  provider: string;
}

export interface WatchProgress {
  movieId: number;
  mediaType: "movie" | "tv";
  progress: number;
  duration: number;
  updatedAt: string;
}

export interface UserSettings {
  theme: "dark" | "light";
  audioPriority: "marathi" | "hindi" | "english" | "auto";
  qualityPreference: "1080p" | "720p" | "480p" | "auto";
  autoPlayNext: boolean;
  autoSelectServer: boolean;
}

export interface StreamSource {
  url: string;
  quality: string;
  label: string;
  audioTracks?: AudioTrack[];
}

export interface AudioTrack {
  id: string;
  label: string;
  language: string;
}

export type GenreRow = {
  id: string;
  title: string;
  genreId?: number;
  endpoint: string;
};
