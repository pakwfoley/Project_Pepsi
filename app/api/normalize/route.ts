import { railway } from '@/app/api/_railway';

export async function POST(request: Request) { return railway(request, '/api/normalize'); }
