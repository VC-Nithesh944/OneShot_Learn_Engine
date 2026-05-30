import { NextResponse } from "next/server";

export async function GET() {
  const price =
    process.env.PREMIUM_MONTHLY_PRICE ??
    process.env.NEXT_PUBLIC_PREMIUM_MONTHLY_PRICE ??
    "₹149/month";

  return NextResponse.json({ price });
}
