import { railway } from '../_railway';

export async function GET(request: Request) {
  return railway(request, '/api/economics');
}
