import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware to check for CRON_SECURE_KEY in the Authorization header.
 * Returns NextResponse with 401 or 403 if unauthorized/forbidden.
 * Returns null if authorized (caller should continue).
 */
export function checkCronAuth(req: NextRequest): NextResponse | null {
  const authHeader = req.headers.get('authorization');
  const expectedToken = process.env.CRON_SECURE_KEY;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.split(' ')[1];

  if (token !== expectedToken) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}
