/**
 * Utility functions for API operations
 */

/**
 * Get the base URL for API calls based on the environment
 * This is used for server-side API calls to ensure full URLs are used
 */
export function getBaseUrl() {
  // First check for explicit environment variable
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, ''); // Remove trailing slash if present
  }

  // In browser context, we can use relative URLs, so return empty
  if (typeof window !== 'undefined') {
    return '';
  }

  // For server-side in development, default to localhost
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }

  // For production, fall back to the deployment URL from Vercel
  // This works well for Vercel deployments
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Final fallback - warn and return localhost
  console.warn('No base URL detected. Using localhost as fallback. Set NEXT_PUBLIC_BASE_URL for proper operation.');
  return 'http://localhost:3000';
}

/**
 * Create a full URL from a path
 * @param path The path part of the URL (e.g., '/api/route')
 * @returns A full URL with the appropriate base URL
 */
export function createApiUrl(path: string) {
  const baseUrl = getBaseUrl();
  // Ensure path starts with slash
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // If we have a base URL, combine them; otherwise just return the path
  // (which works for browser-side fetch calls)
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}
