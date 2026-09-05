import { railway } from '@/app/api/_railway';

export async function GET(request: Request) { return railway(request, '/api/listings'); }
export async function POST(request: Request) { return railway(request, '/api/listings'); }
