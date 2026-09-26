export interface SafeApiResult<T> {
  data: T | null;
  isJson: boolean;
}

export async function readSafeApiResponse<T>(response: Response): Promise<SafeApiResult<T>> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json") && !contentType.toLowerCase().includes("+json")) {
    return { data: null, isJson: false };
  }

  try {
    return { data: await response.json() as T, isJson: true };
  } catch {
    return { data: null, isJson: false };
  }
}